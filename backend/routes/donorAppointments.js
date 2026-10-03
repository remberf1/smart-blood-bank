const express = require('express');
const router = express.Router();
const DonationAppointment = require('../models/DonationAppointment');
const Hospital = require('../models/Hospital');
const Donor = require('../models/Donor');
const authDonor = require('../middleware/authDonor');

// Create an appointment (protected)
router.post('/', authDonor, async (req, res) => {
  try {
    const { hospitalId, appointmentDate, preferredDay, preferredWindow, donationType, notes } = req.body;
    const donorId = req.donor._id;

    // Validate hospital exists
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }

    // Refresh donor data from database
    const donor = await Donor.findById(donorId);
    if (!donor) return res.status(404).json({ error: 'Donor not found' });

    // 1. Clinical Ineligibility Guard
    if (donor.eligibilityStatus === 'ineligible') {
      return res.status(403).json({
        error: `You are currently ineligible to donate: ${donor.deferralReason || 'Clinical deferral by medical staff'}.`,
      });
    }

    // 2. Donation Type & Clinical Deferral Interval Check (WHO / NBTS)
    // Whole blood: minimum 56 days (8 weeks)
    // Platelet apheresis: minimum 14 days
    // Plasma apheresis: minimum 28 days
    const validDonationTypes = ['WHOLE_BLOOD', 'PLATELET_APHERESIS', 'PLASMA_APHERESIS'];
    const chosenDonationType = validDonationTypes.includes(donationType)
      ? donationType
      : (donor.donationTypePreference || 'WHOLE_BLOOD');

    const minIntervalDays = chosenDonationType === 'PLATELET_APHERESIS' ? 14 : chosenDonationType === 'PLASMA_APHERESIS' ? 28 : 56;
    const DAY_MS = 24 * 60 * 60 * 1000;

    if (donor.lastDonationDate) {
      const elapsedDays = Math.floor((Date.now() - new Date(donor.lastDonationDate).getTime()) / DAY_MS);
      if (elapsedDays < minIntervalDays) {
        const eligibleDate = new Date(new Date(donor.lastDonationDate).getTime() + minIntervalDays * DAY_MS);
        return res.status(403).json({
          error: `Under National Blood Service safety standards, donors must observe a minimum waiting period of ${minIntervalDays} days after a donation. Your last donation was on ${new Date(donor.lastDonationDate).toLocaleDateString('en-GB')}. Your next eligible donation date is ${eligibleDate.toLocaleDateString('en-GB')} (${minIntervalDays - elapsedDays} day(s) remaining).`,
        });
      } else if (donor.eligibilityStatus === 'deferred' && (!donor.deferralReason || donor.deferralReason.toLowerCase().includes('waiting period') || donor.deferralReason.toLowerCase().includes('days'))) {
        // Recovery window elapsed — restore eligible status
        donor.eligibilityStatus = 'eligible';
        donor.deferralReason = undefined;
        await donor.save();
      }
    }

    if (donor.eligibilityStatus === 'deferred') {
      return res.status(403).json({
        error: `You are currently deferred: ${donor.deferralReason || 'Temporary clinical deferral. Please consult blood bank staff'}.`,
      });
    }

    // 3. Prevent duplicate active appointments
    const activeAppt = await DonationAppointment.findOne({
      donorId,
      status: { $in: ['pending', 'scheduled'] },
    }).populate('hospitalId', 'name');

    if (activeAppt) {
      return res.status(409).json({
        error: `You already have an active donation appointment (${activeAppt.status === 'scheduled' ? 'confirmed' : 'pending assignment'}) at ${activeAppt.hospitalId?.name || 'a hospital'}. Please attend or cancel it before booking another.`,
      });
    }

    let apptDate;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    if (appointmentDate) {
      apptDate = new Date(appointmentDate);
      if (isNaN(apptDate.getTime()) || apptDate < todayStart) {
        return res.status(400).json({ error: 'Please choose today or a future date to donate.' });
      }
    } else {
      apptDate = new Date();
    }

    const appointment = new DonationAppointment({
      donorId,
      hospitalId,
      appointmentDate: apptDate,
      preferredDay: preferredDay || (appointmentDate ? apptDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : 'Earliest available date'),
      preferredWindow: ['morning', 'afternoon', 'flexible'].includes(preferredWindow) ? preferredWindow : 'morning',
      donationType: chosenDonationType,
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