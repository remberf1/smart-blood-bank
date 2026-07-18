const { test } = require('node:test');
const assert = require('node:assert');
const {
  haversineDistance,
  getDistanceScore,
  getRecencyScore,
  getStockScore,
} = require('../controllers/wpsEngine');

test('haversineDistance is 0 for the same point', () => {
  assert.strictEqual(haversineDistance(6.5244, 3.3792, 6.5244, 3.3792), 0);
});

test('haversineDistance is symmetric', () => {
  const a = haversineDistance(6.5244, 3.3792, 9.0579, 7.4951);
  const b = haversineDistance(9.0579, 7.4951, 6.5244, 3.3792);
  assert.ok(Math.abs(a - b) < 1e-9);
});

test('haversineDistance Lagos->Abuja is ~525km', () => {
  const d = haversineDistance(6.5244, 3.3792, 9.0579, 7.4951);
  assert.ok(d > 490 && d < 560, `expected ~525km, got ${d}`);
});

test('getDistanceScore anchors and monotonic decrease', () => {
  assert.strictEqual(getDistanceScore(0), 1);
  assert.ok(Math.abs(getDistanceScore(20) - 0.5) < 1e-9);
  assert.ok(Math.abs(getDistanceScore(50) - 0.1) < 1e-9);
  assert.ok(Math.abs(getDistanceScore(100) - 0) < 1e-9);
  assert.strictEqual(getDistanceScore(150), 0);
  // strictly decreasing across the range
  const pts = [0, 5, 20, 35, 50, 75, 100];
  for (let i = 1; i < pts.length; i++) {
    assert.ok(getDistanceScore(pts[i]) <= getDistanceScore(pts[i - 1]));
  }
});

test('getRecencyScore: exponential decay, 24h half-life', () => {
  const now = Date.now();
  const at = (hrs) => new Date(now - hrs * 3600 * 1000);
  assert.strictEqual(getRecencyScore(at(0)), 1);
  assert.ok(Math.abs(getRecencyScore(at(24)) - 0.5) < 1e-3);
  assert.ok(Math.abs(getRecencyScore(at(48)) - 0.25) < 1e-3);
  assert.strictEqual(getRecencyScore(null), 0);
  assert.strictEqual(getRecencyScore(undefined), 0);
});

test('getStockScore normalizes by max', () => {
  assert.strictEqual(getStockScore(5, 10), 0.5);
  assert.strictEqual(getStockScore(10, 10), 1);
  assert.strictEqual(getStockScore(0, 10), 0);
  assert.strictEqual(getStockScore(5, 0), 0); // guard against divide-by-zero
});
