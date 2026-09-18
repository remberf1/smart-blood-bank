const express = require('express');
const router = express.Router();
const DonationAppointment = require('../models/DonationAppointment');
const Hospital = require('../models/Hospital');
const authDonor = require('../middleware/authDonor');

// Create an appointment (protected)
router.post('/', authDonor, async (req, res) => {
  try {
    const { hospitalId, appointmentDate, preferredDay, preferredWindow, notes } = req.body;
    const donorId = req.donor._id;

    // Validate hospital exists
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }

    const apptDate = new Date(appointmentDate);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    if (isNaN(apptDate.getTime()) || apptDate < todayStart) {
      return res.status(400).json({ error: 'Please choose today or a future date to donate.' });
    }

    const appointment = new DonationAppointment({
      donorId,
      hospitalId,
      appointmentDate: apptDate,
      preferredDay: preferredDay || apptDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }),
      preferredWindow: ['morning', 'afternoon', 'flexible'].includes(preferredWindow) ? preferredWindow : 'morning',
      donorNinMasked: req.donor.ninMasked || undefined,
      notes,
    });
    await appointment.save();
    res.status(201).json(appointment);
  } catch (err) {
    console.error('Error creating appointment:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get donor's appointments (protected)
router.get('/', authDonor, async (req, res) => {
  try {
    const appointments = await DonationAppointment.find({ donorId: req.donor._id })
      .populate('hospitalId', 'name address contactPhone')
      .sort({ appointmentDate: 1 });
    res.json(appointments);
  } catch (err) {
    console.error('Error fetching appointments:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel appointment (protected)
router.delete('/:id', authDonor, async (req, res) => {
  try {
    const appointment = await DonationAppointment.findOne({
      _id: req.params.id,
      donorId: req.donor._id,
    });
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    if (!['pending', 'scheduled'].includes(appointment.status)) {
      return res.status(400).json({ error: 'Only pending or confirmed appointments can be cancelled' });
    }
    appointment.status = 'cancelled';
    await appointment.save();
    res.json({ message: 'Appointment cancelled', appointment });
  } catch (err) {
    console.error('Error cancelling appointment:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;