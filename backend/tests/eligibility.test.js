const { test } = require('node:test');
const assert = require('node:assert');
const { calculateAge, evaluateDonorEligibility } = require('../utils/eligibility');

const yearsAgo = (y, extraDays = 0) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - y);
  d.setDate(d.getDate() + extraDays);
  return d;
};
const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000);

test('calculateAge accounts for month/day, not just the year', () => {
  const now = new Date('2026-01-15');
  // Born late Dec 2008 -> only 17 on 2026-01-15 (the old year-only bug said 18)
  assert.strictEqual(calculateAge('2008-12-31', now), 17);
  assert.strictEqual(calculateAge('2008-01-01', now), 18);
});

test('eligible: adult, healthy weight, no recent donation', () => {
  const r = evaluateDonorEligibility({ dateOfBirth: yearsAgo(30), weight: 70 });
  assert.strictEqual(r.status, 'eligible');
  assert.strictEqual(r.reason, null);
});

test('deferred: under 18 (just shy of birthday)', () => {
  // 18th birthday is tomorrow -> still 17 today
  const r = evaluateDonorEligibility({ dateOfBirth: yearsAgo(18, 1), weight: 70 });
  assert.strictEqual(r.status, 'deferred');
  assert.match(r.reason, /Age must be/);
});

test('deferred: over 65', () => {
  const r = evaluateDonorEligibility({ dateOfBirth: yearsAgo(66), weight: 70 });
  assert.strictEqual(r.status, 'deferred');
});

test('deferred: underweight', () => {
  const r = evaluateDonorEligibility({ dateOfBirth: yearsAgo(30), weight: 45 });
  assert.strictEqual(r.status, 'deferred');
  assert.match(r.reason, /at least 50kg/);
});

test('deferred: donated within 90 days', () => {
  const r = evaluateDonorEligibility({ dateOfBirth: yearsAgo(30), weight: 70, lastDonationDate: daysAgo(30) });
  assert.strictEqual(r.status, 'deferred');
  assert.match(r.reason, /90 days/);
});

test('eligible again: donation was more than 90 days ago', () => {
  const r = evaluateDonorEligibility({ dateOfBirth: yearsAgo(30), weight: 70, lastDonationDate: daysAgo(100) });
  assert.strictEqual(r.status, 'eligible');
});

test('combined reasons are joined', () => {
  const r = evaluateDonorEligibility({ dateOfBirth: yearsAgo(70), weight: 40 });
  assert.strictEqual(r.status, 'deferred');
  assert.match(r.reason, /Age must be/);
  assert.match(r.reason, /at least 50kg/);
});
