const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const { auth, isSuperAdmin } = require('../middleware/auth');

// GET /api/audit?page=&limit=&action=&actor=  (superadmin only)
router.get('/', auth, isSuperAdmin, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.action) filter.action = req.query.action;
    if (req.query.entity) filter.entity = req.query.entity;
    if (req.query.actor) {
      const safe = String(req.query.actor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.actorEmail = new RegExp(safe, 'i');
    }
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) {
        const d = new Date(req.query.to);
        d.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = d;
      }
    }

    const [data, total, actions, entities] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      AuditLog.countDocuments(filter),
      AuditLog.distinct('action'),
      AuditLog.distinct('entity'),
    ]);

    res.json({
      data,
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
      actions: actions.sort(),
      entities: entities.filter(Boolean).sort(),
    });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
