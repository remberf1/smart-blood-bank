/**
 * One-time migration script for NDPA 2023 compliance.
 * Finds all existing donors with plaintext `nin` fields,
 * hashes them into `ninHash`, ensures `ninMasked` is set,
 * and completely unsets/purges the raw plaintext `nin` field from MongoDB.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Donor = require('../models/Donor');
const { hashNin, maskNin } = require('../utils/nin');

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI environment variable is required.');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    // Query directly from collection to bypass schema select:false
    const donorsWithPlainNin = await Donor.collection.find({
      nin: { $exists: true, $ne: null }
    }).toArray();

    console.log(`🔍 Found ${donorsWithPlainNin.length} donor record(s) with plaintext NIN.`);

    let migrated = 0;
    for (const doc of donorsWithPlainNin) {
      const cleanNin = doc.nin.toString().replace(/\D/g, '');
      const hashed = hashNin(cleanNin);
      const masked = doc.ninMasked || maskNin(cleanNin);

      await Donor.collection.updateOne(
        { _id: doc._id },
        {
          $set: { ninHash: hashed, ninMasked: masked },
          $unset: { nin: "" },
        }
      );
      migrated++;
      console.log(`🔒 Secured record for: ${doc.name} (${doc.email || doc.phone}) -> masked as ${masked}`);
    }

    console.log(`🎉 Migration complete! ${migrated} donor record(s) secured.`);
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

migrate();
