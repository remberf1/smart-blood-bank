const { test } = require('node:test');
const assert = require('node:assert');
const { getCompatibleDonors, isCompatible } = require('../utils/bloodCompatibility');
const { selectCompatible } = require('../services/inventoryService');

const day = (n) => new Date(Date.now() + n * 24 * 3600 * 1000);

test('O- is the universal donor (compatible with every recipient)', () => {
  for (const recipient of ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']) {
    assert.ok(isCompatible(recipient, 'O-'), `${recipient} should accept O-`);
  }
});

test('AB+ is the universal recipient (accepts every donor)', () => {
  for (const donor of ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']) {
    assert.ok(isCompatible('AB+', donor), `AB+ should accept ${donor}`);
  }
});

test('A+ accepts A+/A-/O+/O- but not B+/AB+', () => {
  assert.deepStrictEqual(getCompatibleDonors('A+'), ['A+', 'A-', 'O+', 'O-']);
  assert.ok(!isCompatible('A+', 'B+'));
  assert.ok(!isCompatible('A+', 'AB+'));
});

test('O- recipient can only receive O-', () => {
  assert.deepStrictEqual(getCompatibleDonors('O-'), ['O-']);
  assert.ok(!isCompatible('O-', 'O+'));
});

test('selectCompatible consumes exact group before universal O-', () => {
  const batches = [
    { _id: 'o_neg', bloodGroup: 'O-', units: 5, expiryDate: day(3) }, // soonest expiry, but universal
    { _id: 'a_pos', bloodGroup: 'A+', units: 5, expiryDate: day(30) },
  ];
  const r = selectCompatible(batches, 2, getCompatibleDonors('A+'));
  assert.strictEqual(r.shortfall, 0);
  assert.strictEqual(r.allocations[0].batchId, 'a_pos'); // exact A+ used, O- conserved
});

test('selectCompatible falls back to compatible when exact is short, FEFO within group', () => {
  const batches = [
    { _id: 'a1', bloodGroup: 'A+', units: 1, expiryDate: day(10) },
    { _id: 'o1', bloodGroup: 'O-', units: 5, expiryDate: day(20) },
    { _id: 'o2', bloodGroup: 'O-', units: 5, expiryDate: day(5) }, // earlier expiry O-
  ];
  const r = selectCompatible(batches, 3, getCompatibleDonors('A+'));
  assert.strictEqual(r.shortfall, 0);
  // exact A+ first, then O- by soonest expiry (o2 before o1)
  assert.deepStrictEqual(
    r.allocations.map((a) => [a.batchId, a.units]),
    [['a1', 1], ['o2', 2]]
  );
});

test('selectCompatible reports shortfall when compatible stock is insufficient', () => {
  const batches = [{ _id: 'b1', bloodGroup: 'B+', units: 2, expiryDate: day(4) }];
  // A+ cannot receive B+, so nothing is usable
  const r = selectCompatible(batches, 2, getCompatibleDonors('A+'));
  assert.strictEqual(r.allocated, 0);
  assert.strictEqual(r.shortfall, 2);
});
