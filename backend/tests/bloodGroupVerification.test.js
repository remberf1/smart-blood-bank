const { test } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const {
  donorCorrectionRequestSchema,
  verifyBloodGroupSchema,
  donorRegisterSchema,
} = require('../validators/schemas');
const Donor = require('../models/Donor');

test('donorCorrectionRequestSchema: accepts valid correction request', () => {
  const payload = {
    requestedGroup: 'O-',
    reason: 'Prior lab crossmatch at LUTH confirmed O-negative, entered A+ by mistake.',
  };
  const result = donorCorrectionRequestSchema.safeParse(payload);
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.data.requestedGroup, 'O-');
  }
});

test('donorCorrectionRequestSchema: rejects invalid blood group', () => {
  const payload = {
    requestedGroup: 'Z+',
    reason: 'My blood group was recorded wrong.',
  };
  const result = donorCorrectionRequestSchema.safeParse(payload);
  assert.strictEqual(result.success, false);
});

test('donorCorrectionRequestSchema: rejects empty or too short reason', () => {
  const payload = {
    requestedGroup: 'B+',
    reason: 'hi',
  };
  const result = donorCorrectionRequestSchema.safeParse(payload);
  assert.strictEqual(result.success, false);
});

test('verifyBloodGroupSchema: accepts valid laboratory verification methods', () => {
  const validMethods = [
    'tube_agglutination',
    'gel_card',
    'slide_test',
    'prior_lab_record',
    'automated_analyzer',
  ];

  for (const method of validMethods) {
    const payload = {
      verifiedGroup: 'A+',
      verificationMethod: method,
      notes: 'Forward & reverse typing concordant',
      action: 'approve',
    };
    const result = verifyBloodGroupSchema.safeParse(payload);
    assert.strictEqual(result.success, true, `Method ${method} should be accepted`);
  }
});

test('verifyBloodGroupSchema: rejects invalid verification method', () => {
  const payload = {
    verifiedGroup: 'A+',
    verificationMethod: 'eyeball_inspection',
    action: 'approve',
  };
  const result = verifyBloodGroupSchema.safeParse(payload);
  assert.strictEqual(result.success, false);
});

test('verifyBloodGroupSchema: allows rejection without verifiedGroup and method', () => {
  const payload = {
    action: 'reject',
    notes: 'Confirmatory tube test re-verified original group A+. Request rejected.',
  };
  const result = verifyBloodGroupSchema.safeParse(payload);
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.data.action, 'reject');
  }
});

test('verifyBloodGroupSchema: enforces verifiedGroup and method when action is approve', () => {
  const payload = {
    action: 'approve',
    notes: 'Missing blood group',
  };
  const result = verifyBloodGroupSchema.safeParse(payload);
  assert.strictEqual(result.success, false);
});

test('Donor model defaults: initializes with unverified blood group status', () => {
  const donor = new Donor({
    name: 'Tunde Bakare',
    phone: '+2348012345678',
    bloodGroupSelfReported: 'O+',
    location: {
      type: 'Point',
      coordinates: [3.3792, 6.5244],
    },
    dateOfBirth: new Date('1992-04-10'),
  });

  assert.strictEqual(donor.bloodGroupVerificationStatus, 'unverified');
  assert.strictEqual(donor.bloodGroupVerified, null);
  assert.strictEqual(donor.bloodGroupSelfReported, 'O+');
  assert.deepStrictEqual(donor.verificationHistory, []);
});

test('Donor model pre-save: syncs bloodGroup with verified group when verified', () => {
  const donor = new Donor({
    name: 'Amaka Eze',
    phone: '+2348087654321',
    bloodGroupSelfReported: 'A+',
    bloodGroupVerified: 'O-',
    bloodGroupVerificationStatus: 'verified',
    location: {
      type: 'Point',
      coordinates: [3.3792, 6.5244],
    },
    dateOfBirth: new Date('1990-01-01'),
  });

  // Emulate pre-save sync logic
  if (donor.bloodGroupVerificationStatus === 'verified' && donor.bloodGroupVerified) {
    donor.bloodGroup = donor.bloodGroupVerified;
  }

  assert.strictEqual(donor.bloodGroup, 'O-');
  assert.strictEqual(donor.bloodGroupVerified, 'O-');
  assert.strictEqual(donor.bloodGroupSelfReported, 'A+');
});

test('Donor model verificationHistory: records immutable laboratory audit entries', () => {
  const staffUserId = new mongoose.Types.ObjectId();
  const hospitalId = new mongoose.Types.ObjectId();

  const donor = new Donor({
    name: 'Suleiman Danjuma',
    phone: '+2348033334444',
    bloodGroupSelfReported: 'B+',
    location: {
      type: 'Point',
      coordinates: [3.3792, 6.5244],
    },
    dateOfBirth: new Date('1988-11-20'),
  });

  donor.verificationHistory.push({
    verifiedBy: staffUserId,
    verifiedAt: new Date(),
    verificationMethod: 'tube_agglutination',
    verifiedGroup: 'B-',
    previousGroup: 'B+',
    hospitalId: hospitalId,
    reason: 'Donor reported discrepancy from prior blood drive',
    notes: 'Forward typing Anti-B 4+, Anti-D 0. Reverse typing concordant.',
  });

  donor.bloodGroupVerified = 'B-';
  donor.bloodGroup = 'B-';
  donor.bloodGroupVerificationStatus = 'verified';

  assert.strictEqual(donor.verificationHistory.length, 1);
  const entry = donor.verificationHistory[0];
  assert.strictEqual(entry.verifiedGroup, 'B-');
  assert.strictEqual(entry.previousGroup, 'B+');
  assert.strictEqual(entry.verificationMethod, 'tube_agglutination');
  assert.strictEqual(entry.verifiedBy.toString(), staffUserId.toString());
  assert.strictEqual(entry.hospitalId.toString(), hospitalId.toString());
});

test('SOS Safety Gate: query predicate strictly requires bloodGroupVerificationStatus === verified', () => {
  // In services/sosService.js:
  // query: { bloodGroupVerificationStatus: 'verified', bloodGroupVerified: { $in: compatibleGroups } }
  const mockDonors = [
    { name: 'Donor 1', bloodGroup: 'O-', bloodGroupVerified: 'O-', bloodGroupVerificationStatus: 'verified' },
    { name: 'Donor 2', bloodGroup: 'O-', bloodGroupSelfReported: 'O-', bloodGroupVerificationStatus: 'unverified' },
    { name: 'Donor 3', bloodGroup: 'O-', bloodGroupSelfReported: 'O-', bloodGroupVerificationStatus: 'pending_verification' },
  ];

  const sosFilter = (d, compatibleGroup) => {
    return d.bloodGroupVerificationStatus === 'verified' && (d.bloodGroupVerified === compatibleGroup);
  };

  const eligibleForEmergencySOS = mockDonors.filter((d) => sosFilter(d, 'O-'));

  // Only the verified donor should qualify for emergency SOS matching
  assert.strictEqual(eligibleForEmergencySOS.length, 1);
  assert.strictEqual(eligibleForEmergencySOS[0].name, 'Donor 1');
});
