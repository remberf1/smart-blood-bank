const express = require('express');
const router = express.Router();
const SOSRequest = require('../models/SOSRequest');
const { auth, isAdmin } = require('../middleware/auth');

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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
