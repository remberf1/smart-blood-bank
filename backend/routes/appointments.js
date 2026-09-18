const express = require('express');
const router = express.Router();
const DonationAppointment = require('../models/DonationAppointment');
const Hospital = require('../models/Hospital');
const { auth } = require('../middleware/auth');
const { allowRoles, canAccessHospital } = require('../middleware/roles');
const { notifyAppointmentScheduled } = require('../services/notificationService');
const { logAudit } = require('../services/auditService');

// Get hospital donation capacity and current booking load for a given date
// Query: ?date=YYYY-MM-DD&hospitalId=
router.get('/capacity', auth, async (req, res) => {
  try {
    let targetHospitalId = req.user.hospitalId;
    if (req.user.role === 'superadmin' && req.query.hospitalId) {
      targetHospitalId = req.query.hospitalId;
    }
    if (!targetHospitalId) {
      return res.status(400).json({ error: 'Hospital ID is required' });
    }

    const hospital = await Hospital.findById(targetHospitalId);
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }

    const dailyCapacity = hospital.dailyDonationCapacity || 10;
    const hourlyCapacity = hospital.hourlyDonationCapacity || 2;

    const dateParam = req.query.date;
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Find all scheduled appointments on this date
    const scheduledAppts = await DonationAppointment.find({
      hospitalId: targetHospitalId,
      status: 'scheduled',
      $or: [
        { assignedDate: { $gte: startOfDay, $lte: endOfDay } },
        { assignedDate: { $exists: false }, appointmentDate: { $gte: startOfDay, $lte: endOfDay } },
      ],
    }).populate('donorId', 'name bloodGroup phone');

    const totalBooked = scheduledAppts.length;
    const remainingSlots = Math.max(0, dailyCapacity - totalBooked);
    const capacityPercent = Math.min(100, Math.round((totalBooked / dailyCapacity) * 100));
    const isOverbooked = totalBooked >= dailyCapacity;

    // Slot distribution
    const slotCounts = {};
    scheduledAppts.forEach((a) => {
      if (a.assignedTime) {
        slotCounts[a.assignedTime] = (slotCounts[a.assignedTime] || 0) + 1;
      }
    });

    res.json({
      hospitalId: targetHospitalId,
      hospitalName: hospital.name,
      date: startOfDay.toISOString().split('T')[0],
      dailyCapacity,
      hourlyCapacity,
      totalBooked,
      remainingSlots,
      capacityPercent,
      isOverbooked,
      slotCounts,
      scheduledDonors: scheduledAppts.map((a) => ({
        id: a._id,
        name: a.donorId?.name || 'Anonymous Donor',
        bloodGroup: a.donorId?.bloodGroup,
        assignedTime: a.assignedTime || 'Unspecified',
      })),
    });
  } catch (err) {
    console.error('Error fetching capacity:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
        .populate('donorId', 'name phone email bloodGroup eligibilityStatus ninMasked')
        .populate('hospitalId', 'name address contactPhone dailyDonationCapacity')
        .populate('confirmedByAdminId', 'name')
        .sort({ appointmentDate: 1 })
        .skip(skip)
        .limit(limit),
      DonationAppointment.countDocuments(filter),
    ]);

    res.json({ data, page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Schedule an appointment and assign specific date & time (hospital admin/staff)
// Checks capacity and warns/blocks overbooking unless explicitly overridden
router.put('/:id/schedule', auth, allowRoles('admin', 'superadmin', 'staff'), async (req, res) => {
  try {
    const { scheduledDate, assignedTime, notes, overrideCapacity } = req.body;

    if (!scheduledDate || !assignedTime) {
      return res.status(400).json({ error: 'Both scheduledDate and assignedTime are required' });
    }

    const appointment = await DonationAppointment.findById(req.params.id)
      .populate('donorId', 'name phone email bloodGroup')
      .populate('hospitalId', 'name address dailyDonationCapacity');

    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    const hospitalId = appointment.hospitalId?._id || appointment.hospitalId;
    if (!canAccessHospital(req.user, hospitalId)) {
      return res.status(403).json({ error: "You can only manage your own hospital's appointments" });
    }

    const targetDate = new Date(scheduledDate);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduledDate format' });
    }

    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const hospital = await Hospital.findById(hospitalId);
    const dailyCapacity = hospital?.dailyDonationCapacity || 10;

    // Check existing scheduled appointments on this date
    const bookedCount = await DonationAppointment.countDocuments({
      _id: { $ne: appointment._id },
      hospitalId,
      status: 'scheduled',
      $or: [
        { assignedDate: { $gte: startOfDay, $lte: endOfDay } },
        { assignedDate: { $exists: false }, appointmentDate: { $gte: startOfDay, $lte: endOfDay } },
      ],
    });

    if (bookedCount >= dailyCapacity && !overrideCapacity) {
      return res.status(409).json({
        error: `Hospital capacity reached: ${bookedCount}/${dailyCapacity} donors are already scheduled for this date. Exceeding capacity may overload phlebotomy staff. Please choose another date or check capacity override.`,
        isOverbooked: true,
        bookedCount,
        dailyCapacity,
      });
    }

    appointment.appointmentDate = targetDate;
    appointment.assignedDate = targetDate;
    appointment.assignedTime = assignedTime.trim();
    appointment.status = 'scheduled';
    appointment.confirmedByAdminId = req.user._id;
    appointment.confirmedAt = new Date();
    if (notes) appointment.notes = notes.trim();
    appointment.updatedAt = new Date();

    await appointment.save();

    // Trigger notification to donor via WhatsApp and Email
    notifyAppointmentScheduled(appointment, hospital?.name).catch((err) => {
      console.warn('Failed to notify donor of scheduled appointment:', err.message);
    });

    logAudit(req.user, 'appointment.schedule', {
      entity: 'DonationAppointment',
      entityId: appointment._id,
      hospitalId,
      summary: `Scheduled appointment for ${appointment.donorId?.name || 'donor'} on ${targetDate.toDateString()} at ${assignedTime}`,
    });

    res.json({
      message: 'Appointment scheduled successfully',
      appointment,
    });
  } catch (err) {
    console.error('Error scheduling appointment:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update appointment status (complete/miss/cancel) — hospital admin/staff.
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

    appointment.status = status;
    appointment.updatedAt = Date.now();
    await appointment.save();
    res.json(appointment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
