const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Donor = require('../models/Donor');
const { validate } = require('../middleware/validate');
const { forgotPasswordSchema, resetPasswordSchema } = require('../validators/schemas');
const { sendEmail, buildPasswordResetEmail } = require('../services/notificationService');
const { generateResetToken, hashToken } = require('../utils/passwordReset');
const authDonor = require('../middleware/authDonor');
const { formatNigerianPhone } = require('../utils/phone');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ==================== DONOR LOGIN ====================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find donor by email, include password field (hidden by default)
    const donor = await Donor.findOne({ email }).select('+password');
    // No account, or a donor registered without a password (e.g. via staff) —
    // treat both as invalid credentials rather than crashing bcrypt.compare.
    if (!donor || !donor.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, donor.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token (expires in 30 days)
    const token = jwt.sign(
      { donorId: donor._id, role: 'donor', email: donor.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      message: 'Login successful',
      token,
      donor: {
        id: donor._id,
        name: donor.name,
        email: donor.email,
        bloodGroup: donor.bloodGroup,
        eligibilityStatus: donor.eligibilityStatus,
        phone: donor.phone
      }
    });
  } catch (err) {
    console.error('Donor login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== DONOR FORGOT PASSWORD ====================
// Always responds success — never reveal whether an email is registered.
router.post('/forgot-password', validate(forgotPasswordSchema), async (req, res) => {
  const generic = { message: 'If that email is registered, a reset link has been sent.' };
  try {
    const donor = await Donor.findOne({ email: req.body.email });
    if (donor) {
      const { raw, hash, expiry } = generateResetToken();
      donor.resetTokenHash = hash;
      donor.resetTokenExpiry = expiry;
      await donor.save();

      const resetUrl = `${APP_URL}/donor/reset-password?token=${raw}`;
      const e = buildPasswordResetEmail(donor.name, resetUrl);
      sendEmail(donor.email, e.subject, e.text, e.html).catch((err) =>
        console.error('Donor reset email failed:', err.message)
      );
    }
    res.json(generic);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== DONOR RESET PASSWORD ====================
router.post('/reset-password', validate(resetPasswordSchema), async (req, res) => {
  try {
    const { token, password } = req.body;
    const donor = await Donor.findOne({
      resetTokenHash: hashToken(token),
      resetTokenExpiry: { $gt: new Date() },
    }).select('+resetTokenHash +resetTokenExpiry');

    if (!donor) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    }

    donor.password = password; // hashed by the Donor pre-save hook
    donor.resetTokenHash = undefined;
    donor.resetTokenExpiry = undefined;
    await donor.save();

    res.json({ message: 'Password updated. You can now sign in with your new password.' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== GET DONOR PROFILE (Protected) ====================
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'donor') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const donor = await Donor.findById(decoded.donorId)
      .select('-password -qrCode'); // exclude sensitive fields
    if (!donor) return res.status(404).json({ error: 'Donor not found' });

    res.json(donor);
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// ==================== UPDATE OWN PROFILE (Protected) ====================
router.put('/profile', authDonor, async (req, res) => {
  try {
    const donor = req.donor; // full doc loaded by authDonor (password excluded)
    const { name, phone, email, sosOptIn } = req.body;

    if (email && email !== donor.email) {
      const exists = await Donor.findOne({ email, _id: { $ne: donor._id } });
      if (exists) return res.status(400).json({ error: 'That email is already in use.' });
      donor.email = email;
    }
    if (phone) {
      const formatted = formatNigerianPhone(phone) || phone;
      if (formatted !== donor.phone) {
        const exists = await Donor.findOne({ phone: formatted, _id: { $ne: donor._id } });
        if (exists) return res.status(400).json({ error: 'That phone number is already in use.' });
        donor.phone = formatted;
      }
    }
    if (typeof name === 'string' && name.trim()) donor.name = name.trim();
    if (typeof sosOptIn === 'boolean') donor.sosOptIn = sosOptIn;

    await donor.save(); // password not modified → not re-hashed
    res.json({
      message: 'Profile updated',
      donor: {
        id: donor._id,
        name: donor.name,
        email: donor.email,
        phone: donor.phone,
        bloodGroup: donor.bloodGroup,
        eligibilityStatus: donor.eligibilityStatus,
        sosOptIn: donor.sosOptIn,
      },
    });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== CHANGE OWN PASSWORD (Protected) ====================
router.post('/change-password', authDonor, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    // authDonor stripped the password; re-fetch it to verify the current one.
    const donor = await Donor.findById(req.donor._id).select('+password');
    if (!donor.password) {
      return res.status(400).json({ error: 'No password is set on this account. Use "Forgot password" to set one.' });
    }
    const match = await bcrypt.compare(currentPassword || '', donor.password);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });

    donor.password = newPassword; // hashed by the pre-save hook
    await donor.save();
    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;