const { test } = require('node:test');
const assert = require('node:assert');
const { selectFEFO } = require('../services/inventoryService');

const day = (n) => new Date(Date.now() + n * 24 * 3600 * 1000);

test('selectFEFO draws from the earliest-expiring batch first', () => {
  const batches = [
    { _id: 'b_late', units: 5, expiryDate: day(30), donorId: 'd1' },
    { _id: 'b_soon', units: 5, expiryDate: day(3), donorId: 'd2' },
  ];
  const r = selectFEFO(batches, 2);
  assert.strictEqual(r.shortfall, 0);
  assert.strictEqual(r.allocated, 2);
  assert.strictEqual(r.allocations.length, 1);
  assert.strictEqual(r.allocations[0].batchId, 'b_soon'); // soonest expiry consumed first
  assert.strictEqual(r.allocations[0].units, 2);
});

test('selectFEFO spans multiple batches in expiry order', () => {
  const batches = [
    { _id: 'b1', units: 2, expiryDate: day(3), donorId: 'd1' },
    { _id: 'b2', units: 2, expiryDate: day(10), donorId: 'd2' },
    { _id: 'b3', units: 2, expiryDate: day(20), donorId: 'd3' },
  ];
  const r = selectFEFO(batches, 3);
  assert.strictEqual(r.shortfall, 0);
  assert.deepStrictEqual(
    r.allocations.map((a) => [a.batchId, a.units]),
    [['b1', 2], ['b2', 1]]
  );
});

test('selectFEFO reports a shortfall when stock is insufficient', () => {
  const batches = [{ _id: 'b1', units: 2, expiryDate: day(5), donorId: 'd1' }];
  const r = selectFEFO(batches, 5);
  assert.strictEqual(r.allocated, 2);
  assert.strictEqual(r.shortfall, 3);
});

test('selectFEFO skips depleted (0-unit) batches', () => {
  const batches = [
    { _id: 'empty', units: 0, expiryDate: day(1), donorId: 'd1' },
    { _id: 'b2', units: 3, expiryDate: day(9), donorId: 'd2' },
  ];
  const r = selectFEFO(batches, 2);
  assert.strictEqual(r.allocations.length, 1);
  assert.strictEqual(r.allocations[0].batchId, 'b2');
});

test('selectFEFO preserves donor for traceability', () => {
  const batches = [{ _id: 'b1', units: 1, expiryDate: day(4), donorId: 'donor-42' }];
  const r = selectFEFO(batches, 1);
  assert.strictEqual(r.allocations[0].donorId, 'donor-42');
});
