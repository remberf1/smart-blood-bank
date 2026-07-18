const express = require("express");
const router = express.Router();
const QRCode = require("qrcode");
const jwt = require("jsonwebtoken");
const Donor = require("../models/Donor");
const Inventory = require("../models/Inventory");
const { auth, isAdmin } = require("../middleware/auth");

// Format Nigerian phone numbers to E.164 format (+234...)
function formatPhoneNumber(phone) {
  if (!phone) return null;

  // Remove any non-digit characters
  let cleaned = phone.toString().replace(/\D/g, '');

  // If it starts with '0', remove the leading zero (Nigerian local format)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  // If it already has the country code (234) at the start
  if (cleaned.startsWith('234')) {
    // Must have exactly 13 digits (234 + 10 digits)
    if (cleaned.length !== 13) return null;
    return '+' + cleaned;
  }

  // Otherwise, assume the country code is missing. Must have 10 digits.
  if (cleaned.length !== 10) return null;

  return '+' + '234' + cleaned;
}

// ==================== REGISTER DONOR ====================
router.post("/register", async (req, res) => {
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
    const formattedPhone = formatPhoneNumber(phone);

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

    // Calculate eligibility based on basic rules
    let eligibilityStatus = "eligible";
    let deferralReason = null;

    // Rule 1: Age check (18-65 years)
    const age = new Date().getFullYear() - new Date(dateOfBirth).getFullYear();
    if (age < 18 || age > 65) {
      eligibilityStatus = "deferred";
      deferralReason = "Age must be between 18 and 65 years";
    }

    // Rule 2: Weight check (minimum 50kg)
    if (weight && weight < 50) {
      eligibilityStatus = "deferred";
      deferralReason = deferralReason
        ? `${deferralReason}, Weight must be at least 50kg`
        : "Weight must be at least 50kg";
    }

    // Rule 3: Last donation date (at least 90 days ago)
    if (lastDonationDate) {
      const daysSinceLastDonation =
        (Date.now() - new Date(lastDonationDate).getTime()) /
        (1000 * 60 * 60 * 24);
      if (daysSinceLastDonation < 90) {
        eligibilityStatus = "deferred";
        deferralReason = deferralReason
          ? `${deferralReason}, Must wait 90 days between donations`
          : "Must wait 90 days between donations";
      }
    }

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
    res.status(500).json({ error: err.message });
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

      // +1 unit to that hospital's blood inventory (create the row if needed).
      const inventory = await Inventory.findOneAndUpdate(
        { hospitalId, resourceType: "blood", bloodGroup },
        { $inc: { units: 1 }, $set: { lastUpdatedAt: Date.now() } },
        { upsert: true, new: true }
      );

      return res.json({
        verified: true,
        donationRecorded: true,
        inventory: { hospitalId, bloodGroup, units: inventory.units },
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// ==================== GET DONOR QR CODE (staff/admin only) ====================
router.get("/:donorId/qrcode", auth, async (req, res) => {
  try {
    const donor = await Donor.findById(req.params.donorId);
    if (!donor) {
      return res.status(404).json({ error: "Donor not found" });
    }

    if (!donor.qrCode) {
      return res.status(404).json({ error: "QR code not generated yet" });
    }

    res.json({ qrCode: donor.qrCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== GET ALL DONORS (admin only) ====================
router.get("/", auth, isAdmin, async (req, res) => {
  try {
    const donors = await Donor.find().select("-qrCode");
    res.json(donors);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
      const formattedPhone = formatPhoneNumber(phone);
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
