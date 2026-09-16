const { test } = require('node:test');
const assert = require('node:assert');
const { donorRegisterSchema } = require('../validators/schemas');
const { formatNigerianPhone } = require('../utils/phone');

test('donorRegisterSchema: valid registration payload passes', () => {
  const payload = {
    name: 'Jane Doe',
    phone: '08012345678',
    email: 'jane@example.com',
    password: 'password123',
    bloodGroup: 'O+',
    location: {
      type: 'Point',
      coordinates: [3.3792, 6.5244],
    },
    dateOfBirth: '1995-05-15',
    gender: 'Female',
    weight: 65,
  };

  const result = donorRegisterSchema.safeParse(payload);
  assert.strictEqual(result.success, true);
});

test('donorRegisterSchema: rejects future date of birth', () => {
  const futureDate = new Date(Date.now() + 86400000 * 365).toISOString().split('T')[0];
  const payload = {
    name: 'Future Person',
    phone: '08012345678',
    email: 'future@example.com',
    password: 'password123',
    bloodGroup: 'A+',
    location: { coordinates: [3.3792, 6.5244] },
    dateOfBirth: futureDate,
  };

  const result = donorRegisterSchema.safeParse(payload);
  assert.strictEqual(result.success, false);
  assert.match(result.error.issues[0].message, /cannot be in the future/i);
});

test('donorRegisterSchema: rejects underage donor (under 16 years old)', () => {
  const underAgeDate = new Date(Date.now() - 86400000 * 365 * 10).toISOString().split('T')[0];
  const payload = {
    name: 'Young Person',
    phone: '08012345678',
    email: 'young@example.com',
    password: 'password123',
    bloodGroup: 'A+',
    location: { coordinates: [3.3792, 6.5244] },
    dateOfBirth: underAgeDate,
  };

  const result = donorRegisterSchema.safeParse(payload);
  assert.strictEqual(result.success, false);
  assert.match(result.error.issues[0].message, /at least 16 years old/i);
});

test('donorRegisterSchema: rejects unrealistic weight (>300kg or <30kg)', () => {
  const base = {
    name: 'Jane Doe',
    phone: '08012345678',
    email: 'jane@example.com',
    password: 'password123',
    bloodGroup: 'O+',
    location: { coordinates: [3.3792, 6.5244] },
    dateOfBirth: '1998-01-01',
  };

  const tooHeavy = donorRegisterSchema.safeParse({ ...base, weight: 111111 });
  assert.strictEqual(tooHeavy.success, false);

  const tooLight = donorRegisterSchema.safeParse({ ...base, weight: 20 });
  assert.strictEqual(tooLight.success, false);
});

test('SOS phone validation: formatNigerianPhone rejects letters like "hh"', () => {
  assert.strictEqual(formatNigerianPhone('hh'), null);
  assert.strictEqual(formatNigerianPhone('080eer11111'), null);
  assert.strictEqual(formatNigerianPhone('08012345678'), '+2348012345678');
});
