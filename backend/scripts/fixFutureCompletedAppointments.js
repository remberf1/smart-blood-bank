const mongoose = require('mongoose');
require('dotenv').config();
const DonationAppointment = require('../models/DonationAppointment');

async function fixFutureCompletedAppointments() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not defined');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const now = new Date();
  const futureCompleted = await DonationAppointment.find({
    status: 'completed',
    $or: [
      { assignedDate: { $gt: now } },
      { assignedDate: { $exists: false }, appointmentDate: { $gt: now } },
    ],
  });

  console.log(`Found ${futureCompleted.length} future appointments incorrectly marked as completed.`);

  for (const appt of futureCompleted) {
    const dateVal = appt.assignedDate || appt.appointmentDate;
    console.log(`Fixing appt ${appt._id} (Scheduled Date: ${dateVal}) -> resetting to 'scheduled'`);
    appt.status = 'scheduled';
    await appt.save();
  }

  console.log('Done fixing future completed appointments.');
  await mongoose.disconnect();
}

fixFutureCompletedAppointments().catch((err) => {
  console.error('Error during cleanup:', err);
  process.exit(1);
});
