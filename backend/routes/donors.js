const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const Donor = require('../models/Donor');

// Format Nigerian phone numbers to E.164 format (+234...)
function formatPhoneNumber(phone) {
  if (!phone) return null;
  
  // Remove any non-digit characters
  let cleaned = phone.toString().replace(/\D/g, '');
  
  // Remove leading '0' if present (for Nigerian numbers)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  // Remove duplicate country code if user typed +234234...
  if (cleaned.startsWith('234234')) {
    cleaned = cleaned.substring(3);
  }
  
  // Add Nigeria country code if not present
  if (!cleaned.startsWith('234')) {
    cleaned = '234' + cleaned;
  }
  
  // Final validation: should be 12 digits total (234 + 9 digits)
  if (cleaned.length !== 12) {
    return null; // Invalid number
  }
  
  return '+' + cleaned;
}

// ==================== REGISTER DONOR ====================
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      bloodGroup,
      location,
      dateOfBirth,
      gender,
      weight,
      lastDonationDate
    } = req.body;

    // Format phone number
    const formattedPhone = formatPhoneNumber(phone);
    
    if (!formattedPhone) {
      return res.status(400).json({ 
        error: 'Invalid phone number. Please use a valid Nigerian number (e.g., 08012345678 or +2348012345678)' 
      });
    }
    
    // Check if donor already exists using formatted phone
    const existingDonor = await Donor.findOne({ phone: formattedPhone });
    if (existingDonor) {
      return res.status(400).json({ error: 'Donor with this phone number already exists' });
    }

    // Calculate eligibility based on basic rules
    let eligibilityStatus = 'eligible';
    let deferralReason = null;

    // Rule 1: Age check (18-65 years)
    const age = new Date().getFullYear() - new Date(dateOfBirth).getFullYear();
    if (age < 18 || age > 65) {
      eligibilityStatus = 'deferred';
      deferralReason = 'Age must be between 18 and 65 years';
    }

    // Rule 2: Weight check (minimum 50kg)
    if (weight && weight < 50) {
      eligibilityStatus = 'deferred';
      deferralReason = deferralReason ? `${deferralReason}, Weight must be at least 50kg` : 'Weight must be at least 50kg';
    }

    // Rule 3: Last donation date (at least 90 days ago)
    if (lastDonationDate) {
      const daysSinceLastDonation = (Date.now() - new Date(lastDonationDate).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastDonation < 90) {
        eligibilityStatus = 'deferred';
        deferralReason = deferralReason ? `${deferralReason}, Must wait 90 days between donations` : 'Must wait 90 days between donations';
      }
    }

    // Create donor with formatted phone
    const donor = new Donor({
      name,
      phone: formattedPhone,  // FIXED: use formattedPhone, not formattedPhone variable name
      email,
      bloodGroup,
      location,
      dateOfBirth,
      gender,
      weight,
      lastDonationDate,
      eligibilityStatus,
      deferralReason
    });

    await donor.save();

    // Generate QR code with donor information
    const qrData = {
      donorId: donor._id,
      name: donor.name,
      bloodGroup: donor.bloodGroup,
      phone: donor.phone,
      eligibilityStatus: donor.eligibilityStatus,
      lastDonationDate: donor.lastDonationDate
    };

    let qrCodeUrl;
    try {
      qrCodeUrl = await QRCode.toDataURL(JSON.stringify(qrData), {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 300
      });
      console.log('QR code generated successfully, length:', qrCodeUrl.length);
    } catch (qrError) {
      console.error('QR generation failed:', qrError);
      qrCodeUrl = null;
    }
    
    // Update donor with QR code
    donor.qrCode = qrCodeUrl;
    await donor.save();

    res.status(201).json({
      message: 'Donor registered successfully',
      donor: {
        id: donor._id,
        name: donor.name,
        phone: donor.phone,
        bloodGroup: donor.bloodGroup,
        eligibilityStatus: donor.eligibilityStatus,
        deferralReason: donor.deferralReason,
        qrCode: donor.qrCode
      }
    });
  } catch (err) {
    console.error('Error registering donor:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== VERIFY DONOR BY QR CODE ====================
router.post('/verify', async (req, res) => {
  try {
    const { qrData } = req.body;
    
    // Parse QR data
    let donorInfo;
    try {
      donorInfo = JSON.parse(qrData);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid QR code format' });
    }

    // Find donor by ID
    const donor = await Donor.findById(donorInfo.donorId);
    if (!donor) {
      return res.status(404).json({ error: 'Donor not found' });
    }

    // Update last donation date if this is a donation event
    if (req.body.recordDonation) {
      donor.lastDonationDate = new Date();
      donor.eligibilityStatus = 'deferred';
      donor.deferralReason = '90 days waiting period after donation';
      await donor.save();
    }

    res.json({
      verified: true,
      donor: {
        name: donor.name,
        bloodGroup: donor.bloodGroup,
        phone: donor.phone,
        eligibilityStatus: donor.eligibilityStatus,
        lastDonationDate: donor.lastDonationDate,
        deferralReason: donor.deferralReason
      }
    });
  } catch (err) {
    console.error('Error verifying donor:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== GET DONOR BY PHONE ====================
router.get('/phone/:phone', async (req, res) => {
  try {
    const donor = await Donor.findOne({ phone: req.params.phone });
    if (!donor) {
      return res.status(404).json({ error: 'Donor not found' });
    }
    res.json({
      id: donor._id,
      name: donor.name,
      phone: donor.phone,
      bloodGroup: donor.bloodGroup,
      eligibilityStatus: donor.eligibilityStatus,
      lastDonationDate: donor.lastDonationDate
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== GET DONOR QR CODE ====================
router.get('/:donorId/qrcode', async (req, res) => {
  try {
    const donor = await Donor.findById(req.params.donorId);
    if (!donor) {
      return res.status(404).json({ error: 'Donor not found' });
    }
    
    if (!donor.qrCode) {
      return res.status(404).json({ error: 'QR code not generated yet' });
    }
    
    res.json({ qrCode: donor.qrCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== GET ALL DONORS ====================
router.get('/', async (req, res) => {
  try {
    const donors = await Donor.find().select('-qrCode');
    res.json(donors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== UPDATE DONOR ELIGIBILITY ====================
router.put('/:donorId/eligibility', async (req, res) => {
  try {
    const { eligibilityStatus, deferralReason } = req.body;
    const donor = await Donor.findByIdAndUpdate(
      req.params.donorId,
      { eligibilityStatus, deferralReason, updatedAt: Date.now() },
      { new: true }
    );
    if (!donor) {
      return res.status(404).json({ error: 'Donor not found' });
    }
    res.json({
      message: 'Eligibility updated',
      donor: {
        name: donor.name,
        bloodGroup: donor.bloodGroup,
        eligibilityStatus: donor.eligibilityStatus,
        deferralReason: donor.deferralReason
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== UPDATE DONOR (General) ====================
router.put('/:donorId', async (req, res) => {
  try {
    const { phone, name, bloodGroup, location, eligibilityStatus } = req.body;
    
    // Clean donorId
    const donorId = req.params.donorId.replace(/[\n\r]/g, '').trim();
    
    // Format phone number if provided
    let updateData = { 
      name, 
      bloodGroup, 
      location, 
      eligibilityStatus, 
      updatedAt: Date.now() 
    };
    
    if (phone) {
      const formattedPhone = formatPhoneNumber(phone);
      if (!formattedPhone) {
        return res.status(400).json({ error: 'Invalid phone number format' });
      }
      updateData.phone = formattedPhone;
    }
    
    const donor = await Donor.findByIdAndUpdate(
      donorId,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!donor) {
      return res.status(404).json({ error: 'Donor not found' });
    }
    
    res.json({ 
      message: 'Donor updated successfully', 
      donor: {
        id: donor._id,
        name: donor.name,
        phone: donor.phone,
        bloodGroup: donor.bloodGroup,
        eligibilityStatus: donor.eligibilityStatus
      }
    });
  } catch (err) {
    console.error('Error updating donor:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== DELETE DONOR ====================
router.delete('/:donorId', async (req, res) => {
  try {
    // Clean donorId
    const donorId = req.params.donorId.replace(/[\n\r]/g, '').trim();
    
    const donor = await Donor.findByIdAndDelete(donorId);
    if (!donor) {
      return res.status(404).json({ error: 'Donor not found' });
    }
    res.json({ message: 'Donor deleted successfully', donor: { name: donor.name, phone: donor.phone } });
  } catch (err) {
    console.error('Error deleting donor:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;