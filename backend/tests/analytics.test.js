const { test } = require('node:test');
const assert = require('node:assert');
const { summarizeRequests } = require('../services/analyticsService');

const h = (n) => n * 60 * 60 * 1000;

test('summarizeRequests: empty list', () => {
  const r = summarizeRequests([]);
  assert.deepStrictEqual(r, { total: 0, delivered: 0, fulfillmentRate: 0, avgDeliveryHours: null });
});

test('summarizeRequests: fulfillment rate', () => {
  const now = Date.now();
  const list = [
    { deliveryStatus: 'delivered', createdAt: new Date(now - h(4)), deliveredAt: new Date(now) },
    { deliveryStatus: 'delivered', createdAt: new Date(now - h(2)), deliveredAt: new Date(now) },
    { deliveryStatus: 'pending', createdAt: new Date(now - h(1)) },
    { deliveryStatus: 'cancelled', createdAt: new Date(now - h(1)) },
  ];
  const r = summarizeRequests(list);
  assert.strictEqual(r.total, 4);
  assert.strictEqual(r.delivered, 2);
  assert.strictEqual(r.fulfillmentRate, 0.5);
  assert.strictEqual(r.avgDeliveryHours, 3); // (4 + 2) / 2
});

test('summarizeRequests: delivered without deliveredAt is excluded from avg', () => {
  const now = Date.now();
  const list = [
    { deliveryStatus: 'delivered', createdAt: new Date(now - h(6)), deliveredAt: new Date(now) },
    { deliveryStatus: 'delivered', createdAt: new Date(now - h(2)) }, // no deliveredAt
  ];
  const r = summarizeRequests(list);
  assert.strictEqual(r.delivered, 2);
  assert.strictEqual(r.avgDeliveryHours, 6); // only the one with a timestamp
});
