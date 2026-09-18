const test = require('node:test');
const assert = require('node:assert/strict');
const AuditLog = require('../models/AuditLog');
const Donor = require('../models/Donor');

test('AuditLog immutability: pre hooks block updates and deletions', async () => {
  assert.rejects(
    async () => {
      await AuditLog.updateOne({ action: 'test' }, { summary: 'modified' });
    },
    /strictly immutable/i,
    'Expected updateOne on AuditLog to be rejected'
  );

  assert.rejects(
    async () => {
      await AuditLog.deleteOne({ action: 'test' });
    },
    /strictly immutable/i,
    'Expected deleteOne on AuditLog to be rejected'
  );
});

test('NDPA 2023 compliance: Donor schema contains consent version and retention timestamp', () => {
  const donor = new Donor({
    name: 'Test Donor',
    phone: '+2348011223344',
    bloodGroup: 'O+',
    location: { type: 'Point', coordinates: [3.3792, 6.5244] },
  });

  assert.equal(donor.consentVersion, 'NDPA-2023-v1.0');
  assert.ok(donor.consentTimestamp instanceof Date);
  assert.ok(donor.retentionUntil instanceof Date);
  // Retention period should be ~5 years in the future
  const fiveYearsMs = 4.9 * 365 * 24 * 60 * 60 * 1000;
  assert.ok(donor.retentionUntil.getTime() - donor.consentTimestamp.getTime() > fiveYearsMs);
});
