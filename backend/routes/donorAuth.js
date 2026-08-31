const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Donor = require('../models/Donor');

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

module.exports = router;