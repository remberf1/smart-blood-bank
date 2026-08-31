/**
 * Seed test donors so pagination/search can be exercised.
 *
 * Usage (from backend/):
 *   node scripts/seedDonors.js 50      # create 50 test donors
 *   npm run seed:donors -- 50
 *
 * All created donors are named "Test Donor N" with emails testdonorN@example.com
 * so they're easy to spot and remove. To remove them later:
 *   node scripts/seedDonors.js --clean
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Donor = require('../models/Donor');
const { evaluateDonorEligibility } = require('../utils/eligibility');

const GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  if (process.argv.includes('--clean')) {
    const r = await Donor.deleteMany({ email: /^testdonor\d+@example\.com$/ });
    console.log(`Removed ${r.deletedCount} test donor(s).`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const n = Number(process.argv.find((a) => /^\d+$/.test(a))) || 25;
  let created = 0;
  for (let i = 1; i <= n; i++) {
    const phone = '+234' + (7000000000 + Math.floor(Math.random() * 2999999999));
    const dob = new Date(1975 + Math.floor(Math.random() * 30), i % 12, (i % 27) + 1);
    const bloodGroup = GROUPS[i % GROUPS.length];
    // Make ~1 in 4 recently-donated so they show as deferred.
    const lastDonationDate = i % 4 === 0 ? new Date(Date.now() - 20 * 86400000) : undefined;
    const { status, reason } = evaluateDonorEligibility({ dateOfBirth: dob, weight: 60, lastDonationDate });
    try {
      await Donor.create({
        name: `Test Donor ${i}`,
        phone,
        email: `testdonor${i}@example.com`,
        bloodGroup,
        location: { type: 'Point', coordinates: [3.3 + Math.random(), 6.5 + Math.random()] },
        dateOfBirth: dob,
        lastDonationDate,
        eligibilityStatus: status,
        deferralReason: reason,
      });
      created++;
    } catch (e) {
      // duplicate phone/email — skip
    }
  }
  console.log(`Created ${created} test donor(s).`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
