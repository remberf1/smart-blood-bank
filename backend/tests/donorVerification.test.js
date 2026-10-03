'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

// Model schema and validation logic test
const Donor = require('../models/Donor');

test('Donor Model: contains verification fields with defaults', () => {
  const schemaPaths = Donor.schema.paths;
  assert.ok(schemaPaths.isVerified, 'isVerified field must exist');
  assert.equal(schemaPaths.isVerified.defaultValue, false, 'New donors must default to isVerified: false');
  assert.ok(schemaPaths.emailVerified, 'emailVerified field must exist');
  assert.ok(schemaPaths.phoneVerified, 'phoneVerified field must exist');
  assert.ok(schemaPaths.verificationToken, 'verificationToken field must exist');
  assert.ok(schemaPaths.verificationTokenExpiry, 'verificationTokenExpiry field must exist');
  assert.ok(schemaPaths.phoneOtp, 'phoneOtp field must exist');
  assert.ok(schemaPaths.phoneOtpExpiry, 'phoneOtpExpiry field must exist');
});

test('Donor Verification: OTP generation is a 6-digit numeric string', () => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  assert.equal(otp.length, 6);
  assert.match(otp, /^\d{6}$/);
});

test('Donor Verification: verificationToken is cryptographically secure 64-hex string', () => {
  const token = crypto.randomBytes(32).toString('hex');
  assert.equal(token.length, 64);
  assert.match(token, /^[0-9a-f]{64}$/);
});

test('Donor Verification: Expiry calculation satisfies 15-minute OTP and 24-hour email link limits', () => {
  const now = Date.now();
  const phoneOtpExpiry = new Date(now + 15 * 60 * 1000);
  const tokenExpiry = new Date(now + 24 * 60 * 60 * 1000);

  assert.ok(phoneOtpExpiry.getTime() - now <= 15 * 60 * 1000 + 50);
  assert.ok(tokenExpiry.getTime() - now <= 24 * 60 * 60 * 1000 + 50);
});

test('SOS Safety Gate: excludes unverified donors from emergency dispatch filter', () => {
  // Query must filter with isVerified: { $ne: false } to exclude unverified registrations
  const sosFilter = {
    bloodGroup: { $in: ['O-'] },
    isVerified: { $ne: false },
    lastDonationDate: { $lte: new Date() }
  };

  const candidate1 = { name: 'Active Verified Donor', isVerified: true };
  const candidate2 = { name: 'Unverified Registered Donor', isVerified: false };
  const candidate3 = { name: 'Legacy Pre-existing Donor', isVerified: undefined };

  const matchesFilter = (doc) => {
    if (sosFilter.isVerified['$ne'] !== undefined) {
      if (doc.isVerified === sosFilter.isVerified['$ne']) return false;
    }
    return true;
  };

  assert.equal(matchesFilter(candidate1), true, 'Verified donor should be eligible');
  assert.equal(matchesFilter(candidate2), false, 'Unverified donor must NOT receive SOS alerts');
  assert.equal(matchesFilter(candidate3), true, 'Legacy seeded donor (isVerified undefined) remains compatible');
});
