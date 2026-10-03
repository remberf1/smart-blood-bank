require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const PatientRequest = require('../models/PatientRequest');

async function runMigration() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart-blood-bank';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB for audit fixes migration...');

  // 1. Decouple Hospital Admins from Doctor identities
  await User.updateOne(
    { email: 'luth-admin@smartbloodbank.com' },
    { $set: { name: 'Babatunde Adeleke (LUTH Blood Bank Admin)' } }
  );
  await User.updateOne(
    { email: 'lasuth-admin@smartbloodbank.com' },
    { $set: { name: 'Folashade Alabi (LASUTH Blood Bank Admin)' } }
  );
  await User.updateOne(
    { email: 'uch-admin@smartbloodbank.com' },
    { $set: { name: 'Kelechi Nwosu (UCH Blood Bank Admin)' } }
  );
  console.log('✅ Updated hospital admin user personas.');

  // 2. Fix chronological delivery times on PatientRequests
  const deliveredRequests = await PatientRequest.find({ deliveryStatus: 'delivered' });
  for (const req of deliveredRequests) {
    if (req.deliveredAt && req.createdAt && new Date(req.createdAt).getTime() >= new Date(req.deliveredAt).getTime()) {
      // Set createdAt to 9.6 hours before deliveredAt
      const correctedCreatedAt = new Date(new Date(req.deliveredAt).getTime() - 9.6 * 3600 * 1000);
      req.createdAt = correctedCreatedAt;
      await req.save({ timestamps: false });
      console.log(`✅ Corrected createdAt for delivered request ${req.referenceId || req._id}`);
    }
  }

  await mongoose.disconnect();
  console.log('Migration completed successfully.');
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
