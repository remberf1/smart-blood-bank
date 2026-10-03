const express = require("express");
const router = express.Router();
const QRCode = require("qrcode");
const jwt = require("jsonwebtoken");
const Donor = require("../models/Donor");
const DonationAppointment = require("../models/DonationAppointment");
const { auth, isAdmin } = require("../middleware/auth");
const { allowRoles } = require("../middleware/roles");
const { formatNigerianPhone } = require("../utils/phone");
const { evaluateDonorEligibility } = require("../utils/eligibility");
const { addBloodUnits } = require("../services/inventoryService");
const { refreshDonorEligibility } = require("../services/eligibilityService");
const { allocateBlood } = require("../services/allocationService");
const { validate } = require("../middleware/validate");
const { donorRegisterSchema, verifyBloodGroupSchema } = require("../validators/schemas");
const { logAudit } = require("../services/auditService");
const crypto = require("crypto");
const {
  sendEmail,
  buildDonorVerificationEmail,
  sendDonorVerificationOtp,
} = require("../services/notificationService");

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

  // Pre-donation ABO/Rh confirmatory test requirement:
  // If the donor's blood group is unverified or pending verification, a confirmatory laboratory test
  // (e.g. Tube Agglutination or Gel Card) MUST be documented before blood is drawn and entered into inventory.
  if (donor.bloodGroupVerificationStatus !== 'verified') {
    if (!triageData?.verifiedGroup || !triageData?.verificationMethod) {
      const err = new Error(
        "Confirmatory ABO/Rh blood grouping test is mandatory for unverified/self-reported donors prior to logging blood into inventory."
      );
      err.status = 400;
      throw err;
    }
  }

  // Laboratory confirmatory blood grouping at donation intake
  if (triageData?.verifiedGroup && triageData?.verificationMethod) {
    const prevGroup = donor.bloodGroupVerified || donor.bloodGroupSelfReported || donor.bloodGroup;
    donor.verificationHistory.push({
      verifiedBy: triageData.staffId || undefined,
      verifiedAt: new Date(),
      verificationMethod: triageData.verificationMethod,
      verifiedGroup: triageData.verifiedGroup,
      previousGroup: prevGroup,
      hospitalId,
      reason: 'Confirmatory blood test at donation intake',
      notes: triageData.notes || 'Routine pre-donation laboratory testing',
    });
    donor.bloodGroupVerified = triageData.verifiedGroup;
    donor.bloodGroup = triageData.verifiedGroup;
    donor.bloodGroupVerificationStatus = 'verified';
    if (donor.correctionRequest && donor.correctionRequest.status === 'pending') {
      donor.correctionRequest.status = 'approved';
      donor.correctionRequest.reviewedAt = new Date();
    }
  }

  donor.lastDonationDate = new Date();
  donor.eligibilityStatus = "deferred";
  donor.deferralReason = "90 days waiting period after donation";
  // Tag the donor's home hospital on their first recorded donation.
  if (!donor.homeHospitalId) donor.homeHospitalId = hospitalId;
  await donor.save();

  // Medically cancel all active appointments for this donor to maintain clinical safety during 90-day deferral
  const activeAppts = await DonationAppointment.find({
    donorId: donor._id,
    status: { $in: ['pending', 'scheduled'] },
  });
  for (const appt of activeAppts) {
    appt.status = 'cancelled';
    appt.notes = (appt.notes || '') + ` [System medical safety: Cancelled due to donation intake recorded on ${new Date().toLocaleDateString('en-GB')}. Donor is deferred for 90 days].`;
    await appt.save();
    await logAudit(
      { email: 'system.phlebotomy@smartbloodbank.com', role: 'system', hospitalId },
      'appointment.auto_cancel_on_donation',
      {
        entity: 'DonationAppointment',
        entityId: appt._id,
        hospitalId,
        summary: `Medically cancelled active appointment for ${donor.name} due to new donation recorded. Donor is deferred for 90 days.`,
      }
    ).catch(() => {});
  }

  const componentType = triageData?.componentType ||
    (donor.donationTypePreference === 'PLATELET_APHERESIS' ? 'PLATELET_CONCENTRATE' :
     donor.donationTypePreference === 'PLASMA_APHERESIS' ? 'FRESH_FROZEN_PLASMA' : 'WHOLE_BLOOD');

  const units = await addBloodUnits({
    hospitalId,
    bloodGroup: donor.bloodGroup,
    componentType,
    units: 1,
    donorId: donor._id,
    source: "donation",
  });
  allocateBlood().catch(console.error);
  return { bloodGroup: donor.bloodGroup, componentType, units };
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
      donationTypePreference,
      nonRemunerationDeclared,
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

    // Generate secure multi-channel verification tokens
    const phoneOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const now = Date.now();

    // Create donor with formatted phone and unverified state
    const reportedGroup = req.body.bloodGroupSelfReported || bloodGroup || "UNKNOWN";
    const donor = new Donor({
      name,
      phone: formattedPhone,
      email: normalizedEmail || undefined,
      password,
      bloodGroup: reportedGroup === "UNKNOWN" ? "O+" : reportedGroup,
      bloodGroupSelfReported: reportedGroup,
      bloodGroupVerified: null,
      bloodGroupVerificationStatus: 'unverified',
      isVerified: false,
      emailVerified: false,
      phoneVerified: false,
      phoneOtp,
      phoneOtpExpires: new Date(now + 15 * 60 * 1000), // 15 mins
      phoneOtpExpiry: new Date(now + 15 * 60 * 1000),
      verificationToken,
      verificationTokenExpiry: new Date(now + 24 * 60 * 60 * 1000), // 24 hours
      donationTypePreference: donationTypePreference || 'WHOLE_BLOOD',
      nonRemunerationDeclared: nonRemunerationDeclared !== false,
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
    } catch (qrError) {
      console.error("QR generation failed:", qrError);
      qrCodeUrl = null;
    }

    donor.qrCode = qrCodeUrl;
    await donor.save();

    // Trigger multi-channel verification dispatch
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    if (donor.email) {
      const verifyUrl = `${appUrl}/donor/verify?token=${verificationToken}&email=${encodeURIComponent(donor.email)}`;
      const emailContent = buildDonorVerificationEmail({ name: donor.name, verifyUrl, otpCode: phoneOtp });
      sendEmail(donor.email, emailContent.subject, emailContent.text, emailContent.html).catch((err) =>
        console.warn('Registration verification email notice failed:', err.message)
      );
    }

    if (donor.phone) {
      sendDonorVerificationOtp(donor.phone, phoneOtp).catch((err) =>
        console.warn('Registration WhatsApp OTP notice failed:', err.message)
      );
    }

    logAudit(
      { _id: donor._id, role: 'donor', name: donor.name },
      'donor.registered_pending_verification',
      {
        entity: 'Donor',
        entityId: donor._id,
        summary: `Donor registered with unverified identity. Verification tokens dispatched to WhatsApp and email.`,
      }
    );

    res.status(201).json({
      message: "Donor registration initiated. Please verify your account using the 6-digit code sent to your WhatsApp/SMS or the link sent to your email.",
      pendingVerification: true,
      email: donor.email,
      phone: donor.phone,
      donor: {
        id: donor._id,
        name: donor.name,
        phone: donor.phone,
        email: donor.email,
        bloodGroup: donor.bloodGroup,
        eligibilityStatus: donor.eligibilityStatus,
        deferralReason: donor.deferralReason,
        isVerified: false,
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
      if (tokenErr.name === 'TokenExpiredError') {
        return res.status(400).json({
          error: "Digital Donor Pass has EXPIRED (Anti-Screenshot Security). Please ask the donor to present the live rotating pass in their mobile app.",
          code: "PASS_EXPIRED",
        });
      }
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
        _id: donor._id,
        name: donor.name,
        bloodGroup: donor.bloodGroup,
        bloodGroupSelfReported: donor.bloodGroupSelfReported,
        bloodGroupVerified: donor.bloodGroupVerified,
        bloodGroupVerificationStatus: donor.bloodGroupVerificationStatus || 'unverified',
        phone: donor.phone,
        eligibilityStatus: donor.eligibilityStatus,
        lastDonationDate: donor.lastDonationDate,
        deferralReason: donor.deferralReason,
        ninMasked: donor.nin ? `NIN-*****${donor.nin.slice(-4)}` : undefined,
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
      if (req.user.role === "superadmin") {
        return res.status(403).json({
          error: "Separation of Duties violation: Super Admin cannot record phlebotomy donations. Clinical intake must be performed by certified hospital staff.",
        });
      }

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

// ==================== VERIFY / UPDATE DONOR BLOOD GROUP (Staff/Admin) ====================
router.post(
  "/:donorId/verify-blood-group",
  auth,
  allowRoles("admin", "superadmin", "staff"),
  validate(verifyBloodGroupSchema),
  async (req, res) => {
    try {
      if (req.user.role === "superadmin") {
        return res.status(403).json({
          error: "Separation of Duties violation: Super Admin cannot certify laboratory blood grouping. Verification must be performed by hospital laboratory staff.",
        });
      }

      const donor = await Donor.findById(req.params.donorId);
      if (!donor) return res.status(404).json({ error: "Donor not found" });

      const { verifiedGroup, verificationMethod, notes, action } = req.body;

      // Handle rejection of a pending correction request
      if (action === 'reject') {
        if (donor.correctionRequest && donor.correctionRequest.status === 'pending') {
          donor.correctionRequest.status = 'rejected';
          donor.correctionRequest.reviewedBy = req.user._id;
          donor.correctionRequest.reviewedAt = new Date();
          donor.correctionRequest.reviewNotes = notes || 'Rejected after clinical laboratory review';
        }
        donor.bloodGroupVerificationStatus = donor.bloodGroupVerified ? 'verified' : 'unverified';
        await donor.save();

        logAudit(req.user, 'donor.blood_group_verify_reject', {
          entity: 'Donor',
          entityId: donor._id,
          hospitalId: req.user.hospitalId,
          summary: `Rejected correction request for ${donor.name} (notes: ${notes || 'none'})`,
        });

        return res.json({
          message: 'Correction request rejected. Current blood group remains unchanged.',
          donor: {
            id: donor._id,
            name: donor.name,
            bloodGroup: donor.bloodGroup,
            bloodGroupSelfReported: donor.bloodGroupSelfReported,
            bloodGroupVerified: donor.bloodGroupVerified,
            bloodGroupVerificationStatus: donor.bloodGroupVerificationStatus,
            correctionRequest: donor.correctionRequest,
          },
        });
      }

      const previousGroup = donor.bloodGroupVerified || donor.bloodGroupSelfReported || donor.bloodGroup;

      // Append immutable verification audit record
      donor.verificationHistory.push({
        verifiedBy: req.user._id,
        verifiedAt: new Date(),
        verificationMethod,
        verifiedGroup,
        previousGroup,
        hospitalId: req.user.hospitalId,
        reason: donor.correctionRequest?.reason || 'Clinical laboratory blood grouping',
        notes: notes || undefined,
      });

      // Update verified blood group
      donor.bloodGroupVerified = verifiedGroup;
      donor.bloodGroup = verifiedGroup;
      donor.bloodGroupVerificationStatus = 'verified';

      // Approve correction request if one was pending
      if (donor.correctionRequest && donor.correctionRequest.status === 'pending') {
        donor.correctionRequest.status = 'approved';
        donor.correctionRequest.reviewedBy = req.user._id;
        donor.correctionRequest.reviewedAt = new Date();
        donor.correctionRequest.reviewNotes = notes || 'Approved following laboratory crossmatching';
      }

      // Re-generate verified digital QR pass
      try {
        const qrToken = jwt.sign(
          {
            donorId: donor._id,
            type: "donor-verify",
            bloodGroup: verifiedGroup,
            verified: true,
            verifiedBy: req.user._id,
          },
          process.env.JWT_SECRET
        );
        donor.qrCode = await QRCode.toDataURL(qrToken, {
          errorCorrectionLevel: "H",
          margin: 1,
          width: 300,
        });
      } catch (qrErr) {
        console.warn('QR regeneration warning:', qrErr.message);
      }

      await donor.save();

      logAudit(req.user, 'donor.blood_group_verified', {
        entity: 'Donor',
        entityId: donor._id,
        hospitalId: req.user.hospitalId,
        summary: `Verified blood group ${verifiedGroup} via ${verificationMethod} for ${donor.name} (prev: ${previousGroup})`,
      });

      res.json({
        message: `Successfully verified donor blood group as ${verifiedGroup}`,
        donor: {
          id: donor._id,
          name: donor.name,
          bloodGroup: donor.bloodGroup,
          bloodGroupSelfReported: donor.bloodGroupSelfReported,
          bloodGroupVerified: donor.bloodGroupVerified,
          bloodGroupVerificationStatus: donor.bloodGroupVerificationStatus,
          correctionRequest: donor.correctionRequest,
          verificationHistory: donor.verificationHistory,
          qrCode: donor.qrCode,
        },
      });
    } catch (err) {
      console.error('Error verifying donor blood group:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ==================== GET ALL DONORS (admin only, paginated) ====================
// Query: ?page=1&limit=20&search=&bloodGroup=&eligibility=&verificationStatus=
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
    if (req.query.verificationStatus) filter.bloodGroupVerificationStatus = req.query.verificationStatus;
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
    if (bloodGroup !== undefined && bloodGroup !== existingDonor.bloodGroup) {
      const prevGroup = existingDonor.bloodGroupVerified || existingDonor.bloodGroupSelfReported || existingDonor.bloodGroup;
      existingDonor.verificationHistory.push({
        verifiedBy: req.user._id,
        verifiedAt: new Date(),
        verificationMethod: req.body.verificationMethod || 'prior_lab_record',
        verifiedGroup: bloodGroup,
        previousGroup: prevGroup,
        hospitalId: req.user.hospitalId,
        reason: 'Administrative / laboratory clinical update',
        notes: notes || 'Updated via donor record update',
      });
      existingDonor.bloodGroupVerified = bloodGroup;
      existingDonor.bloodGroup = bloodGroup;
      existingDonor.bloodGroupVerificationStatus = 'verified';
      updateData.verificationHistory = existingDonor.verificationHistory;
      updateData.bloodGroupVerified = bloodGroup;
      updateData.bloodGroup = bloodGroup;
      updateData.bloodGroupVerificationStatus = 'verified';
    }
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
