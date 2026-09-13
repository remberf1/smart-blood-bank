const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const forecast = require('../services/forecastService');

// Scope resolution mirrors analytics: superadmin sees the network (or a specific
// hospital via ?hospitalId=); admin/staff are locked to their own hospital.
function resolveScope(req) {
  if (req.user.role === 'superadmin') return req.query.hospitalId || null;
  return req.user.hospitalId || null;
}

const clamp = (q, def, min, max) => Math.min(Math.max(Number(q) || def, min), max);

// GET /api/forecast/demand?hospitalId=&horizonDays=&historyDays=
router.get('/demand', auth, async (req, res) => {
  try {
    const result = await forecast.forecastForHospital(resolveScope(req), {
      horizonDays: clamp(req.query.horizonDays, 14, 1, 90),
      historyDays: clamp(req.query.historyDays, 60, 14, 365),
    });
    res.json(result);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
