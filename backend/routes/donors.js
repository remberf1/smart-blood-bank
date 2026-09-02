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
const { validate } = require("../middleware/validate");
const { donorRegisterSchema } = require("../validators/schemas");

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
        .json({ error: "Donor with this phone number already exists" });
    }

    // Calculate eligibility using the shared rules (accurate age, weight, wait).
    const { status: eligibilityStatus, reason: deferralReason } =
      evaluateDonorEligibility({ dateOfBirth, weight, lastDonationDate });

    // Create donor with formatted phone
    const donor = new Donor({
      name,
      phone: formattedPhone, // FIXED: use formattedPhone, not formattedPhone variable name
      email,
      password,
      bloodGroup,
      location,
      dateOfBirth,
      gender,
      weight,
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
    try {
      // New format: signed token containing only the donor id.
      const decoded = jwt.verify(qrData, process.env.JWT_SECRET);
      if (decoded.type !== "donor-verify" || !decoded.donorId) {
        throw new Error("Not a donor-verify token");
      }
      donorId = decoded.donorId;
    } catch (tokenErr) {
      // Legacy fallback: QR codes issued before signing embedded plain JSON.
      try {
        donorId = JSON.parse(qrData).donorId;
      } catch (jsonErr) {
        return res.status(400).json({ error: "Invalid QR code" });
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
      if (donor.eligibilityStatus !== "eligible") {
        return res.status(400).json({
          error: `Donor is not eligible to donate (status: ${donor.eligibilityStatus})`,
        });
      }

      // The donation is recorded at the verifying staff's hospital.
      const hospitalId = req.user.hospitalId || req.body.hospitalId;
      if (!hospitalId) {
        return res.status(400).json({ error: "A hospitalId is required to record a donation" });
      }

      const bloodGroup = donor.bloodGroup;

      donor.lastDonationDate = new Date();
      donor.eligibilityStatus = "deferred";
      donor.deferralReason = "90 days waiting period after donation";
      await donor.save();

      // Record the donation as a dated, traceable batch (donorId + expiry) and
      // refresh the hospital's blood inventory cache.
      const units = await addBloodUnits({
        hospitalId,
        bloodGroup,
        units: 1,
        donorId: donor._id,
        source: "donation",
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
router.get("/", auth, isAdmin, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.bloodGroup) filter.bloodGroup = req.query.bloodGroup;
    if (req.query.eligibility) filter.eligibilityStatus = req.query.eligibility;
    if (req.query.search) {
      const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ name: rx }, { phone: rx }, { email: rx }];
    }

    const [data, total, eligible, deferred, groups] = await Promise.all([
      Donor.find(filter).select("-qrCode").sort({ createdAt: -1 }).skip(skip).limit(limit),
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

// ==================== UPDATE DONOR (General, staff/admin only) ====================
router.put("/:donorId", auth, async (req, res) => {
  try {
    const { phone, name, bloodGroup, location, eligibilityStatus } = req.body;

    // Clean donorId
    const donorId = req.params.donorId.replace(/[\n\r]/g, "").trim();

    // Format phone number if provided
    let updateData = {
      name,
      bloodGroup,
      location,
      eligibilityStatus,
      updatedAt: Date.now(),
    };

    if (phone) {
      const formattedPhone = formatNigerianPhone(phone);
      if (!formattedPhone) {
        return res.status(400).json({ error: "Invalid phone number format" });
      }
      updateData.phone = formattedPhone;
    }

    const donor = await Donor.findByIdAndUpdate(donorId, updateData, {
      new: true,
      runValidators: true,
    });

    if (!donor) {
      return res.status(404).json({ error: "Donor not found" });
    }

    res.json({
      message: "Donor updated successfully",
      donor: {
        id: donor._id,
        name: donor.name,
        phone: donor.phone,
        bloodGroup: donor.bloodGroup,
        eligibilityStatus: donor.eligibilityStatus,
      },
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
