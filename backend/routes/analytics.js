const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const analytics = require('../services/analyticsService');

// Resolve which hospital's data the caller may see:
// - superadmin: network-wide, or a specific hospital via ?hospitalId=
// - admin/staff: locked to their own hospital
function resolveScope(req) {
  if (req.user.role === 'superadmin') {
    return req.query.hospitalId || null; // null = network-wide
  }
  return req.user.hospitalId || null;
}

const clampDays = (q) => Math.min(Math.max(Number(q) || 30, 1), 365);

router.get('/summary', auth, async (req, res) => {
  try {
    res.json(await analytics.summary(resolveScope(req)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stock-by-group', auth, async (req, res) => {
  try {
    res.json(await analytics.stockByGroup(resolveScope(req)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/donations', auth, async (req, res) => {
  try {
    res.json(await analytics.donationStats(resolveScope(req), clampDays(req.query.days)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/requests', auth, async (req, res) => {
  try {
    res.json(await analytics.requestStats(resolveScope(req), clampDays(req.query.days)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/wastage', auth, async (req, res) => {
  try {
    res.json(await analytics.wastageStats(resolveScope(req), clampDays(req.query.days)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
