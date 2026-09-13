const { test } = require('node:test');
const assert = require('node:assert');
const {
  buildDailySeries,
  weekdayFactors,
  trendFactor,
  weightedDailyMean,
  predictDemand,
  assessShortage,
} = require('../services/forecastService');

const DAY = 24 * 3600 * 1000;
const daysAgo = (n, base = Date.now()) => new Date(base - n * DAY);

test('buildDailySeries produces a dense series with zeros for empty days', () => {
  const now = new Date('2026-09-04T12:00:00Z');
  const events = [
    { createdAt: daysAgo(0, now.getTime()), units: 3 },
    { createdAt: daysAgo(0, now.getTime()), units: 2 }, // same day → summed
    { createdAt: daysAgo(2, now.getTime()), units: 1 },
  ];
  const series = buildDailySeries(events, { days: 4, now });
  assert.strictEqual(series.length, 4);
  assert.strictEqual(series[series.length - 1].units, 5); // today = 3+2
  assert.strictEqual(series[series.length - 3].units, 1); // 2 days ago
  assert.strictEqual(series[series.length - 2].units, 0); // yesterday empty
});

test('buildDailySeries ignores events outside the window', () => {
  const now = new Date('2026-09-04T12:00:00Z');
  const series = buildDailySeries([{ createdAt: daysAgo(10, now.getTime()), units: 9 }], { days: 5, now });
  assert.strictEqual(series.reduce((a, b) => a + b.units, 0), 0);
});

test('weightedDailyMean weights recent days more heavily', () => {
  // rising demand: recent days higher → weighted mean above the plain mean
  const series = [0, 0, 0, 10, 10, 10].map((units, i) => ({ date: `d${i}`, dow: i % 7, units }));
  const plain = series.reduce((a, b) => a + b.units, 0) / series.length; // 5
  assert.ok(weightedDailyMean(series) > plain);
});

test('weekdayFactors average to ~1 and flag a heavy day', () => {
  // Mondays (dow=1) get 10, other days 0
  const series = Array.from({ length: 28 }, (_, i) => ({ date: `d${i}`, dow: i % 7, units: i % 7 === 1 ? 10 : 0 }));
  const f = weekdayFactors(series);
  assert.strictEqual(f.length, 7);
  assert.ok(f[1] > 1.5); // Monday is the heavy day (clamped ≤2)
  assert.ok(f[0] < 1); // Sunday below average
});

test('weekdayFactors returns all-ones when there is no demand', () => {
  const series = Array.from({ length: 14 }, (_, i) => ({ date: `d${i}`, dow: i % 7, units: 0 }));
  assert.deepStrictEqual(weekdayFactors(series), Array(7).fill(1));
});

test('trendFactor detects a rising trend and is clamped', () => {
  const series = Array.from({ length: 28 }, (_, i) => ({ date: `d${i}`, dow: i % 7, units: i < 14 ? 2 : 8 }));
  const t = trendFactor(series);
  assert.ok(t > 1);
  assert.ok(t <= 1.4); // clamped
});

test('predictDemand returns a horizon of per-day expectations and a total', () => {
  const now = new Date('2026-09-04T12:00:00Z');
  const series = Array.from({ length: 30 }, (_, i) => ({ date: `d${i}`, dow: i % 7, units: 4 }));
  const f = predictDemand(series, { horizonDays: 7, now });
  assert.strictEqual(f.perDay.length, 7);
  assert.ok(f.total > 0);
  assert.ok(Math.abs(f.dailyMean - 4) < 0.001); // flat demand → mean 4
  assert.strictEqual(f.confidence, 'high'); // 30 non-zero days
});

test('predictDemand confidence drops with sparse data', () => {
  const now = new Date('2026-09-04T12:00:00Z');
  const series = Array.from({ length: 30 }, (_, i) => ({ date: `d${i}`, dow: i % 7, units: i < 3 ? 5 : 0 }));
  assert.strictEqual(predictDemand(series, { horizonDays: 7, now }).confidence, 'low');
});

test('assessShortage: ample stock is ok, no restock', () => {
  const forecast = { dailyMean: 2, total: 28, std: 1 };
  const r = assessShortage(forecast, 200, { horizonDays: 14 });
  assert.strictEqual(r.riskLevel, 'ok');
  assert.strictEqual(r.suggestedRestock, 0);
  assert.ok(r.coverageDays > 14);
});

test('assessShortage: stock below lead-time demand is critical', () => {
  const forecast = { dailyMean: 5, total: 70, std: 2 };
  const r = assessShortage(forecast, 3, { horizonDays: 14, leadTimeDays: 3 }); // 3 < 5*3=15
  assert.strictEqual(r.riskLevel, 'critical');
  assert.ok(r.suggestedRestock > 0);
});

test('assessShortage: stock covers lead time but not the horizon is at-risk', () => {
  const forecast = { dailyMean: 5, total: 70, std: 2 };
  const r = assessShortage(forecast, 30, { horizonDays: 14, leadTimeDays: 3 }); // 30 ≥ 15, < 70
  assert.strictEqual(r.riskLevel, 'at-risk');
});

test('assessShortage: no historical demand → none, never recommends stock', () => {
  const forecast = { dailyMean: 0, total: 0, std: 0 };
  const r = assessShortage(forecast, 0, { horizonDays: 14 });
  assert.strictEqual(r.riskLevel, 'none');
  assert.strictEqual(r.suggestedRestock, 0);
  assert.strictEqual(r.coverageDays, null);
});

test('assessShortage: suggestedRestock covers horizon demand plus safety buffer', () => {
  const forecast = { dailyMean: 4, total: 56, std: 3 };
  const r = assessShortage(forecast, 10, { horizonDays: 14, leadTimeDays: 3, serviceZ: 1.65 });
  // required = ceil(56 + safety); restock = required - 10, and must exceed bare horizon shortfall
  assert.ok(r.requiredUnits >= 56);
  assert.strictEqual(r.suggestedRestock, r.requiredUnits - 10);
});
