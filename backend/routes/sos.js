const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const SOSRequest = require('../models/SOSRequest');
const { auth, isAdmin } = require('../middleware/auth');
const { triggerSOS } = require('../services/sosService');
const { formatNigerianPhone } = require('../utils/phone');

// Public emergency trigger — tightly rate-limited to prevent donor-alert spam.
const sosTriggerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many SOS requests. Please call your nearest hospital directly.' },
});

// POST /api/sos/trigger  (public) — raise an emergency and alert nearby
// compatible donors. Needs the requester's location to find donors near them.
router.post('/trigger', sosTriggerLimiter, async (req, res) => {
  try {
    const { bloodGroup, lat, lon, phone } = req.body;
    const VALID = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    if (!VALID.includes(bloodGroup)) {
      return res.status(400).json({ error: 'Select a valid blood group.' });
    }
    if (lat == null || lon == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))) {
      return res.status(400).json({ error: 'Your location is required to find nearby donors.' });
    }
    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({ error: 'Please enter your phone number so donors and hospitals can reach you.' });
    }
    const formattedPhone = formatNigerianPhone(phone);
    if (!formattedPhone) {
      return res.status(400).json({ error: 'Invalid phone number. Please enter a valid Nigerian number (e.g., 08012345678 or +2348012345678).' });
    }
    const result = await triggerSOS(bloodGroup, Number(lat), Number(lon), formattedPhone, 15);
    res.status(201).json(result);
  } catch (err) {
    console.error('SOS trigger error:', err);
    res.status(500).json({ error: 'Could not raise the SOS. Please contact a hospital directly.' });
  }
});

// List SOS requests (admin), optionally filtered by status
router.get('/', auth, isAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const requests = await SOSRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(requests);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a single SOS request (admin)
router.get('/:id', auth, isAdmin, async (req, res) => {
  try {
    const request = await SOSRequest.findById(req.params.id)
      .populate('donorsAlerted.donorId', 'name phone bloodGroup')
      .populate('donorsResponded.donorId', 'name phone bloodGroup');
    if (!request) return res.status(404).json({ error: 'SOS request not found' });
    res.json(request);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Update SOS status: resolved / expired (admin)
router.put('/:id/status', auth, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'resolved', 'expired'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const request = await SOSRequest.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!request) return res.status(404).json({ error: 'SOS request not found' });
    res.json(request);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
