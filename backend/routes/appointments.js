const express = require('express');
const router = express.Router();
const DonationAppointment = require('../models/DonationAppointment');
const { auth } = require('../middleware/auth');
const { allowRoles, canAccessHospital } = require('../middleware/roles');

// List appointments for the admin's hospital (superadmin: all, or ?hospitalId).
// Query: ?status=&page=&limit=
router.get('/', auth, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const skip = (page - 1) * limit;

    if (req.user.role !== 'superadmin' && !req.user.hospitalId) {
      return res.json({ data: [], page, limit, total: 0, totalPages: 1 });
    }

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.user.role !== 'superadmin') filter.hospitalId = req.user.hospitalId;
    else if (req.query.hospitalId) filter.hospitalId = req.query.hospitalId;

    const [data, total] = await Promise.all([
      DonationAppointment.find(filter)
        .populate('donorId', 'name phone bloodGroup eligibilityStatus')
        .populate('hospitalId', 'name')
        .sort({ appointmentDate: 1 })
        .skip(skip)
        .limit(limit),
      DonationAppointment.countDocuments(filter),
    ]);

    res.json({ data, page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Update appointment status (accept/complete/miss/cancel) — hospital admin/staff.
router.put('/:id/status', auth, allowRoles('admin', 'superadmin', 'staff'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'scheduled', 'completed', 'cancelled', 'missed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const appointment = await DonationAppointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    if (!canAccessHospital(req.user, appointment.hospitalId)) {
      return res.status(403).json({ error: "You can only manage your own hospital's appointments" });
    }

    appointment.status = status; // 'scheduled' = accepted/confirmed
    appointment.updatedAt = Date.now();
    await appointment.save();
    res.json(appointment);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
