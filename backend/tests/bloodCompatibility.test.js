const { test } = require('node:test');
const assert = require('node:assert');
const {
  getCompatibleDonors,
  isCompatible,
  compatibilityIndex,
  compatibilityScore,
} = require('../utils/bloodCompatibility');
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

test('compatibilityIndex ranks exact group first, universal last, -1 if incompatible', () => {
  assert.strictEqual(compatibilityIndex('A+', 'A+'), 0); // exact = most preferred
  assert.strictEqual(compatibilityIndex('A+', 'O-'), 3); // universal = least preferred
  assert.ok(compatibilityIndex('A+', 'A-') < compatibilityIndex('A+', 'O+')); // same-ABO before O
  assert.strictEqual(compatibilityIndex('A+', 'B+'), -1); // incompatible
});

test('compatibilityScore is 1 for exact, decreases for substitutes, 0 if incompatible', () => {
  assert.strictEqual(compatibilityScore('A+', 'A+'), 1);
  assert.strictEqual(compatibilityScore('A+', 'O-'), 0); // last in a 4-long list
  assert.ok(compatibilityScore('A+', 'A-') > compatibilityScore('A+', 'O+'));
  assert.strictEqual(compatibilityScore('A+', 'B+'), 0); // incompatible
  assert.strictEqual(compatibilityScore('O-', 'O-'), 1); // single-item list still scores 1
});

test('search ranking: exact group outranks a compatible substitute regardless of stock', () => {
  // Mirrors the whatsapp search sort key: compatibilityRank asc, then wps desc.
  const rows = [
    { group: 'O-', wps: 0.99, compatibilityRank: compatibilityIndex('A+', 'O-') },
    { group: 'A+', wps: 0.10, compatibilityRank: compatibilityIndex('A+', 'A+') },
  ];
  rows.sort((a, b) => a.compatibilityRank - b.compatibilityRank || b.wps - a.wps);
  assert.strictEqual(rows[0].group, 'A+'); // exact wins even with far lower WPS
});
