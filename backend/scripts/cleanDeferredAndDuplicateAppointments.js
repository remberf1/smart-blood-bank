require('dotenv').config();
const mongoose = require('mongoose');
const Donor = require('../models/Donor');
const DonationAppointment = require('../models/DonationAppointment');
const AuditLog = require('../models/AuditLog');

const DAY_MS = 24 * 60 * 60 * 1000;

async function cleanAppointments() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart-blood-bank';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB for appointment safety cleanup...');

  const now = new Date();

  // 1. Find all active appointments
  const activeAppts = await DonationAppointment.find({
    status: { $in: ['pending', 'scheduled'] },
  }).populate('donorId', 'name email eligibilityStatus lastDonationDate deferralReason');

  console.log(`Evaluating ${activeAppts.length} active appointments for medical safety & duplicate violations...`);

  let deferredCancelledCount = 0;
  let duplicateCancelledCount = 0;

  // Track active appointment per donor to enforce max 1 active appointment rule
  const donorActiveMap = new Map();

  for (const appt of activeAppts) {
    const donor = appt.donorId;
    if (!donor) {
      console.log(`Orphaned appointment ${appt._id} without donor; cancelling.`);
      appt.status = 'cancelled';
      appt.notes = (appt.notes || '') + ' [System correction: Orphaned appointment cancelled]';
      await appt.save();
      continue;
    }

    const donorIdStr = donor._id.toString();
    const apptDate = appt.assignedDate || appt.appointmentDate || new Date();

    // Check 1: Medical Deferral Violation
    // Whole blood deferral interval: 90 days
    const minIntervalDays = appt.donationType === 'PLATELET_APHERESIS' ? 14 : appt.donationType === 'PLASMA_APHERESIS' ? 28 : 90;
    let isDeferred = donor.eligibilityStatus === 'deferred';
    let nextEligibleDate = null;

    if (donor.lastDonationDate) {
      nextEligibleDate = new Date(new Date(donor.lastDonationDate).getTime() + minIntervalDays * DAY_MS);
      if (now < nextEligibleDate || apptDate < nextEligibleDate) {
        isDeferred = true;
      }
    }

    if (isDeferred && (!nextEligibleDate || apptDate < nextEligibleDate)) {
      console.log(`🚨 Cancelling medically deferred appointment for ${donor.name} (${appt._id}) on ${apptDate.toDateString()}`);
      appt.status = 'cancelled';
      appt.notes = (appt.notes || '') + ` [System medical safety correction: Cancelled due to active ${minIntervalDays}-day clinical deferral until ${nextEligibleDate ? nextEligibleDate.toDateString() : 'clearance'}].`;
      await appt.save();
      deferredCancelledCount++;

      await AuditLog.create({
        actorEmail: 'system.safety@smartbloodbank.com',
        actorRole: 'system',
        action: 'appointment.medical_safety_cancellation',
        entity: 'DonationAppointment',
        entityId: appt._id,
        hospitalId: appt.hospitalId,
        summary: `Medically cancelled appointment for ${donor.name} on ${apptDate.toDateString()} due to active clinical deferral (Last donation: ${donor.lastDonationDate ? new Date(donor.lastDonationDate).toDateString() : 'Recent'}).`,
      });
      continue;
    }

    // Check 2: Max 1 active appointment constraint (prevent double/triple booking)
    if (donorActiveMap.has(donorIdStr)) {
      console.log(`⚠️ Cancelling duplicate active appointment for ${donor.name} (${appt._id})`);
      appt.status = 'cancelled';
      appt.notes = (appt.notes || '') + ' [System operational correction: Cancelled duplicate active booking. Donors may only hold 1 active appointment at a time].';
      await appt.save();
      duplicateCancelledCount++;

      await AuditLog.create({
        actorEmail: 'system.safety@smartbloodbank.com',
        actorRole: 'system',
        action: 'appointment.duplicate_cancellation',
        entity: 'DonationAppointment',
        entityId: appt._id,
        hospitalId: appt.hospitalId,
        summary: `Cancelled duplicate active booking for ${donor.name}. Retained single active appointment.`,
      });
    } else {
      donorActiveMap.set(donorIdStr, appt._id);
    }
  }

  console.log(`✅ Cleanup complete:`);
  console.log(`- Deferred appointments cancelled for medical safety: ${deferredCancelledCount}`);
  console.log(`- Duplicate appointments cancelled: ${duplicateCancelledCount}`);

  await mongoose.disconnect();
}

cleanAppointments().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
