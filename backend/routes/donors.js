const express = require("express");
const router = express.Router();
const QRCode = require("qrcode");
const jwt = require("jsonwebtoken");
const Donor = require("../models/Donor");
const { auth, isAdmin } = require("../middleware/auth");
const { allowRoles } = require("../middleware/roles");
const { formatNigerianPhone } = require("../utils/phone");
const { evaluateDonorEligibility } = require("../utils/eligibility");
const { addBloodUnits } = require("../services/inventoryService");
const { refreshDonorEligibility } = require("../services/eligibilityService");
const { allocateBlood } = require("../services/allocationService");
const { validate } = require("../middleware/validate");
const { donorRegisterSchema } = require("../validators/schemas");
const { logAudit } = require("../services/auditService");

// Shared donation-recording logic used by both the QR-scan (/verify) and the
// direct by-donor (/:donorId/record-donation) paths: gate on eligibility, defer
// the donor 90 days, and add a traceable unit to the hospital's blood inventory.
// Throws an Error with `.status` for expected client errors.
async function recordDonationForDonor(donor, hospitalId, triageData = null) {
  if (donor.eligibilityStatus !== "eligible") {
    const err = new Error(`Donor is not eligible to donate (status: ${donor.eligibilityStatus})`);
    err.status = 400;
    throw err;
  }
  if (!hospitalId) {
    const err = new Error("A hospitalId is required to record a donation");
    err.status = 400;
    throw err;
  }

  // Pre-donation clinical triage checks (WHO / NBTS standards)
  if (triageData) {
    if (triageData.weight && Number(triageData.weight) < 50) {
      const err = new Error("Donor does not meet minimum weight requirement of 50 kg");
      err.status = 400;
      throw err;
    }
    if (triageData.hemoglobin && Number(triageData.hemoglobin) < 12.5) {
      const err = new Error("Donor hemoglobin is below clinical threshold of 12.5 g/dL");
      err.status = 400;
      throw err;
    }
    if (triageData.ttiPassed === false) {
      const err = new Error("Rapid TTI screening was reactive; donation cannot proceed");
      err.status = 400;
      throw err;
    }
    if (triageData.weight) donor.weight = Number(triageData.weight);
  }

  donor.lastDonationDate = new Date();
  donor.eligibilityStatus = "deferred";
  donor.deferralReason = "90 days waiting period after donation";
  // Tag the donor's home hospital on their first recorded donation.
  if (!donor.homeHospitalId) donor.homeHospitalId = hospitalId;
  await donor.save();
  const units = await addBloodUnits({
    hospitalId,
    bloodGroup: donor.bloodGroup,
    units: 1,
    donorId: donor._id,
    source: "donation",
  });
  allocateBlood().catch(console.error);
  return { bloodGroup: donor.bloodGroup, units };
}

// ==================== REGISTER DONOR ====================
router.post("/register", validate(donorRegisterSchema), async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      password,
      bloodGroup,
      location,
      dateOfBirth,
      gender,
      weight,
      allergies,
      nin,
      lastDonationDate,
    } = req.body;

    // Format phone number
    const formattedPhone = formatNigerianPhone(phone);

    if (!formattedPhone) {
      return res.status(400).json({
        error:
          "Invalid phone number. Please use a valid Nigerian number (e.g., 08012345678 or +2348012345678)",
      });
    }

    // Check if donor already exists using formatted phone
    const existingDonor = await Donor.findOne({ phone: formattedPhone });
    if (existingDonor) {
      return res
        .status(400)
        .json({ error: "A donor account with this phone number already exists." });
    }

    // Check if donor already exists using email (prevents duplicate accounts)
    const normalizedEmail = email && typeof email === "string" && email.trim()
      ? email.trim().toLowerCase()
      : null;
    if (normalizedEmail) {
      const existingEmail = await Donor.findOne({ email: normalizedEmail });
      if (existingEmail) {
        return res.status(400).json({
          error: "A donor account with this email already exists. Please sign in instead.",
        });
      }
    }

    // Check duplicate NIN if provided (prevents multiple registrations under aliases)
    const cleanNin = typeof nin === "string" ? nin.replace(/\D/g, "") : "";
    if (cleanNin) {
      if (cleanNin.length !== 11) {
        return res.status(400).json({
          error: "National Identification Number (NIN) must be exactly 11 digits.",
        });
      }
      const existingNin = await Donor.findOne({ nin: cleanNin });
      if (existingNin) {
        return res.status(400).json({
          error: "A donor account with this National Identification Number (NIN) is already registered.",
        });
      }
    }

    // Calculate eligibility using the shared rules (accurate age, weight, wait).
    const { status: eligibilityStatus, reason: deferralReason } =
      evaluateDonorEligibility({ dateOfBirth, weight, lastDonationDate });

    // Create donor with formatted phone
    const donor = new Donor({
      name,
      phone: formattedPhone,
      email: normalizedEmail || undefined,
      password,
      bloodGroup,
      location,
      dateOfBirth,
      gender,
      weight,
      allergies: typeof allergies === "string" ? allergies.trim() : "",
      nin: cleanNin || undefined,
      lastDonationDate,
      eligibilityStatus,
      deferralReason,
    });

    await donor.save();

    // Generate QR code holding only a signed token (no PII in the QR itself).
    // Staff scan it and the /verify endpoint resolves the donor server-side.
    const qrToken = jwt.sign(
      { donorId: donor._id, type: "donor-verify" },
      process.env.JWT_SECRET
    );

    let qrCodeUrl;
    try {
      qrCodeUrl = await QRCode.toDataURL(qrToken, {
        errorCorrectionLevel: "H",
        margin: 1,
        width: 300,
      });
      console.log("QR code generated successfully, length:", qrCodeUrl.length);
    } catch (qrError) {
      console.error("QR generation failed:", qrError);
      qrCodeUrl = null;
    }

    // Update donor with QR code
    donor.qrCode = qrCodeUrl;
    await donor.save();

    res.status(201).json({
      message: "Donor registered successfully",
      donor: {
        id: donor._id,
        name: donor.name,
        phone: donor.phone,
        bloodGroup: donor.bloodGroup,
        eligibilityStatus: donor.eligibilityStatus,
        deferralReason: donor.deferralReason,
        qrCode: donor.qrCode,
      },
    });
  } catch (err) {
    console.error("Error registering donor:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== REFRESH ELIGIBILITY (admin/superadmin) ====================
// Restore donors whose post-donation 90-day wait has elapsed. Also runs on a
// daily schedule; this endpoint lets staff trigger it on demand.
router.post("/refresh-eligibility", auth, allowRoles("admin", "superadmin"), async (req, res) => {
  try {
    const restored = await refreshDonorEligibility();
    res.json({ restored });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== VERIFY DONOR BY QR CODE (staff/admin only) ====================
router.post("/verify", auth, async (req, res) => {
  try {
    const { qrData } = req.body;

    // Resolve the donor id from the QR payload.
    let donorId;
    const trimmedData = typeof qrData === 'string' ? qrData.trim() : '';
    try {
      // New format: signed token containing only the donor id.
      const decoded = jwt.verify(trimmedData, process.env.JWT_SECRET);
      if (decoded.type !== "donor-verify" || !decoded.donorId) {
        throw new Error("Not a donor-verify token");
      }
      donorId = decoded.donorId;
    } catch (tokenErr) {
      // Direct Mongo ObjectId fallback (e.g. manual entry or scanner reading ID)
      if (/^[a-fA-F0-9]{24}$/.test(trimmedData)) {
        donorId = trimmedData;
      } else {
        // Legacy fallback: QR codes issued before signing embedded plain JSON.
        try {
          donorId = JSON.parse(trimmedData).donorId;
        } catch (jsonErr) {
          return res.status(400).json({ error: "Invalid QR code or donor token" });
        }
      }
    }

    // Find donor by ID
    const donor = await Donor.findById(donorId);
    if (!donor) {
      return res.status(404).json({ error: "Donor not found" });
    }

    // Record a donation event: only eligible donors, then defer them and add
    // a unit of their blood group to the recording hospital's inventory.
    if (req.body.recordDonation) {
      // The donation is recorded at the verifying staff's hospital
      // (superadmin may pass an explicit hospitalId).
      const hospitalId = req.user.hospitalId || req.body.hospitalId;
      try {
        const { bloodGroup, units } = await recordDonationForDonor(donor, hospitalId, req.body.triage);
        logAudit(req.user, 'donation.record', {
          entity: 'Donor', entityId: donor._id, hospitalId,
          summary: `Recorded ${bloodGroup} donation from ${donor.name} (QR)`,
        });
        return res.json({
          verified: true,
          donationRecorded: true,
          inventory: { hospitalId, bloodGroup, units },
          donor: {
            name: donor.name,
            bloodGroup: donor.bloodGroup,
            phone: donor.phone,
            eligibilityStatus: donor.eligibilityStatus,
            lastDonationDate: donor.lastDonationDate,
            deferralReason: donor.deferralReason,
          },
        });
      } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        throw err;
      }
    }

    res.json({
      verified: true,
      donor: {
        name: donor.name,
        bloodGroup: donor.bloodGroup,
        phone: donor.phone,
        eligibilityStatus: donor.eligibilityStatus,
        lastDonationDate: donor.lastDonationDate,
        deferralReason: donor.deferralReason,
      },
    });
  } catch (err) {
    console.error("Error verifying donor:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ RECORD A DONATION FOR A KNOWN DONOR (staff/admin) ============
// The main UI path: staff record a donation straight from the donor list or an
// appointment — no QR scan needed. Records the donation, defers the donor 90
// days, and adds one traceable unit to the hospital's blood inventory.
// Superadmin (no own hospital) must pass hospitalId in the body.
router.post(
  "/:donorId/record-donation",
  auth,
  allowRoles("superadmin", "admin", "staff"),
  async (req, res) => {
    try {
      const donor = await Donor.findById(req.params.donorId);
      if (!donor) return res.status(404).json({ error: "Donor not found" });

      const hospitalId = req.user.hospitalId || req.body.hospitalId;
      const { bloodGroup, units } = await recordDonationForDonor(donor, hospitalId, req.body.triage);

      logAudit(req.user, 'donation.record', {
        entity: 'Donor', entityId: donor._id, hospitalId,
        summary: `Recorded ${bloodGroup} donation from ${donor.name}`,
      });

      res.json({
        donationRecorded: true,
        inventory: { hospitalId, bloodGroup, units },
        donor: {
          id: donor._id,
          name: donor.name,
          bloodGroup: donor.bloodGroup,
          eligibilityStatus: donor.eligibilityStatus,
          lastDonationDate: donor.lastDonationDate,
        },
      });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      console.error(err); res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ==================== GET DONOR BY PHONE (staff/admin only) ====================
router.get("/phone/:phone", auth, async (req, res) => {
  try {
    const donor = await Donor.findOne({ phone: req.params.phone });
    if (!donor) {
      return res.status(404).json({ error: "Donor not found" });
    }
    res.json({
      id: donor._id,
      name: donor.name,
      phone: donor.phone,
      bloodGroup: donor.bloodGroup,
      eligibilityStatus: donor.eligibilityStatus,
      lastDonationDate: donor.lastDonationDate,
    });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== GET DONOR QR CODE (staff/admin only) ====================
router.get("/:donorId/qrcode", auth, async (req, res) => {
  try {
    const donor = await Donor.findById(req.params.donorId);
    if (!donor) {
      return res.status(404).json({ error: "Donor not found" });
    }

    // Generate the QR on demand if this donor never had one (e.g. seeded or
    // staff-created), so every valid donor always has a scannable code.
    if (!donor.qrCode) {
      const qrToken = jwt.sign(
        { donorId: donor._id, type: "donor-verify" },
        process.env.JWT_SECRET
      );
      donor.qrCode = await QRCode.toDataURL(qrToken, {
        errorCorrectionLevel: "H",
        margin: 1,
        width: 300,
      });
      await donor.save();
    }

    res.json({ qrCode: donor.qrCode });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== GET ALL DONORS (admin only, paginated) ====================
// Query: ?page=1&limit=20&search=&bloodGroup=&eligibility=
// Returns { data, page, limit, total, totalPages, stats } where stats reflect
// the same filter so the summary cards stay in sync with the results.
// Staff can view the donor pool too (they record donations); only donor tokens
// are rejected (by `auth`). Editing eligibility / deleting stays admin-only.
router.get("/", auth, allowRoles("staff", "admin", "superadmin"), async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.bloodGroup) filter.bloodGroup = req.query.bloodGroup;
    if (req.query.eligibility) filter.eligibilityStatus = req.query.eligibility;
    if (req.query.homeHospital) filter.homeHospitalId = req.query.homeHospital;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) {
        const d = new Date(req.query.to);
        d.setHours(23, 59, 59, 999); // include the whole "to" day
        filter.createdAt.$lte = d;
      }
    }
    if (req.query.search) {
      const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ name: rx }, { phone: rx }, { email: rx }];
    }

    // Sorting: whitelist of safe sort keys so the client can order the table.
    const SORTS = {
      recent: { createdAt: -1 },
      name: { name: 1 },
      bloodGroup: { bloodGroup: 1 },
      status: { eligibilityStatus: 1 },
      lastDonation: { lastDonationDate: -1 },
    };
    const sort = SORTS[req.query.sort] || SORTS.recent;

    const [data, total, eligible, deferred, groups] = await Promise.all([
      Donor.find(filter).select("-qrCode").populate("homeHospitalId", "name").sort(sort).skip(skip).limit(limit),
      Donor.countDocuments(filter),
      Donor.countDocuments({ ...filter, eligibilityStatus: "eligible" }),
      Donor.countDocuments({ ...filter, eligibilityStatus: "deferred" }),
      Donor.distinct("bloodGroup", filter),
    ]);

    res.json({
      data,
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
      stats: { total, eligible, deferred, bloodGroups: groups.length },
    });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== UPDATE DONOR ELIGIBILITY (staff/admin only) ====================
router.put("/:donorId/eligibility", auth, async (req, res) => {
  try {
    const { eligibilityStatus, deferralReason } = req.body;
    const donor = await Donor.findByIdAndUpdate(
      req.params.donorId,
      { eligibilityStatus, deferralReason, updatedAt: Date.now() },
      { new: true },
    );
    if (!donor) {
      return res.status(404).json({ error: "Donor not found" });
    }
    res.json({
      message: "Eligibility updated",
      donor: {
        name: donor.name,
        bloodGroup: donor.bloodGroup,
        eligibilityStatus: donor.eligibilityStatus,
        deferralReason: donor.deferralReason,
      },
    });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== UPDATE DONOR (General & clinical, staff/admin only) ====================
router.put("/:donorId", auth, async (req, res) => {
  try {
    const {
      phone,
      name,
      bloodGroup,
      location,
      weight,
      dateOfBirth,
      gender,
      allergies,
      notes,
      homeHospitalId,
      eligibilityStatus,
      deferralReason,
    } = req.body;

    // Clean donorId
    const donorId = req.params.donorId.replace(/[\n\r]/g, "").trim();
    const existingDonor = await Donor.findById(donorId);
    if (!existingDonor) {
      return res.status(404).json({ error: "Donor not found" });
    }

    let updateData = {
      updatedAt: Date.now(),
    };

    if (name !== undefined) updateData.name = name;
    if (bloodGroup !== undefined) updateData.bloodGroup = bloodGroup;
    if (location !== undefined) updateData.location = location;
    if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth;
    if (gender !== undefined) updateData.gender = gender;
    if (allergies !== undefined) updateData.allergies = allergies;
    if (notes !== undefined) updateData.notes = notes;
    if (homeHospitalId !== undefined) updateData.homeHospitalId = homeHospitalId || null;

    if (weight !== undefined) {
      updateData.weight = weight === '' || weight === null ? null : Number(weight);
    }

    if (phone) {
      const formattedPhone = formatNigerianPhone(phone);
      if (!formattedPhone) {
        return res.status(400).json({ error: "Invalid phone number format" });
      }
      updateData.phone = formattedPhone;
    }

    // Eligibility logic:
    // If staff explicitly passed eligibilityStatus (e.g. manual override), respect it.
    // If eligibilityStatus wasn't explicitly forced or was set to 'auto',
    // evaluate based on vitals (weight, age, lastDonationDate).
    if (eligibilityStatus && eligibilityStatus !== 'auto') {
      updateData.eligibilityStatus = eligibilityStatus;
      if (deferralReason !== undefined) {
        updateData.deferralReason = deferralReason;
      }
    } else if (weight !== undefined || dateOfBirth !== undefined) {
      // Re-evaluate eligibility with updated vitals
      const evalResult = evaluateDonorEligibility({
        dateOfBirth: updateData.dateOfBirth !== undefined ? updateData.dateOfBirth : existingDonor.dateOfBirth,
        weight: updateData.weight !== undefined ? updateData.weight : existingDonor.weight,
        lastDonationDate: existingDonor.lastDonationDate,
      });
      updateData.eligibilityStatus = evalResult.status;
      updateData.deferralReason = evalResult.reason;
    }

    const donor = await Donor.findByIdAndUpdate(donorId, updateData, {
      new: true,
      runValidators: true,
    }).populate('homeHospitalId', 'name');

    // Audit log the update
    logAudit({
      userId: req.user._id,
      hospitalId: req.user.hospitalId || donor.homeHospitalId?._id,
      action: 'UPDATE_DONOR',
      resourceType: 'donor',
      details: {
        donorId: donor._id,
        name: donor.name,
        weight: donor.weight,
        eligibilityStatus: donor.eligibilityStatus,
        deferralReason: donor.deferralReason,
      },
    });

    res.json({
      message: "Donor updated successfully",
      donor,
    });
  } catch (err) {
    console.error("Error updating donor:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== DELETE DONOR (admin only) ====================
router.delete("/:donorId", auth, isAdmin, async (req, res) => {
  try {
    // Clean donorId
    const donorId = req.params.donorId.replace(/[\n\r]/g, "").trim();

    const donor = await Donor.findByIdAndDelete(donorId);
    if (!donor) {
      return res.status(404).json({ error: "Donor not found" });
    }
    res.json({
      message: "Donor deleted successfully",
      donor: { name: donor.name, phone: donor.phone },
    });
  } catch (err) {
    console.error("Error deleting donor:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
