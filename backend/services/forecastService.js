const mongoose = require('mongoose');
const PatientRequest = require('../models/PatientRequest');
const Inventory = require('../models/Inventory');
const Hospital = require('../models/Hospital');
const demandModel = require('./demandModel');

// ---------------------------------------------------------------------------
// In-app blood demand forecasting.
//
// Signal = historical patient REQUESTS (units asked for), which is true demand
// regardless of whether it was fulfilled. We build a daily series per blood
// group, then project forward with a recency-weighted mean, a day-of-week
// seasonality profile, and a gentle trend. Uncertainty (std dev) drives a
// safety-stock buffer and a shortage-risk assessment against current stock.
//
// Everything below the DB section is a PURE function (no I/O) so it is unit-
// tested without a database. `predictDemand` is the seam a real ML model
// (e.g. XGBoost via a service) can replace later without touching callers.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const DEFAULTS = {
  historyDays: 60, // how far back to learn from
  horizonDays: 14, // how far forward to forecast
  leadTimeDays: 3, // time to replenish — the near-term window that defines "critical"
  serviceZ: 1.65, // ~95% service level for safety stock
};

const oid = (id) => new mongoose.Types.ObjectId(id);
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const ymd = (d) => startOfDay(d).toISOString().slice(0, 10);

// ---- Pure statistics helpers ----

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/**
 * Bucket dated events into a dense daily series covering the `days` days ending
 * at `now` (inclusive). Missing days are zero — absence of a request is real
 * demand information (zero that day), not missing data.
 * @param {Array<{createdAt: Date|string, units: number}>} events
 * @returns {Array<{date: string, dow: number, units: number}>} oldest → newest
 */
function buildDailySeries(events, { days = DEFAULTS.historyDays, now = new Date() } = {}) {
  const end = startOfDay(now);
  const buckets = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * DAY_MS);
    buckets.set(ymd(d), { date: ymd(d), dow: d.getDay(), units: 0 });
  }
  for (const e of events) {
    const key = ymd(e.createdAt);
    const b = buckets.get(key);
    if (b) b.units += Number(e.units) || 0;
  }
  return Array.from(buckets.values());
}

/**
 * Day-of-week multipliers (index 0=Sun..6=Sat) normalized so an average day = 1.
 * Falls back to all-ones when there isn't enough signal.
 */
function weekdayFactors(series) {
  const overall = mean(series.map((s) => s.units));
  if (overall <= 0) return Array(7).fill(1);
  const byDow = Array.from({ length: 7 }, () => []);
  for (const s of series) byDow[s.dow].push(s.units);
  return byDow.map((vals) => {
    if (!vals.length) return 1;
    const f = mean(vals) / overall;
    // Clamp so a sparse weekday can't produce a wild multiplier.
    return Math.max(0.5, Math.min(2, f));
  });
}

/**
 * Gentle trend multiplier: recent-half mean vs older-half mean, clamped.
 * Returns 1 when there isn't enough data to be confident.
 */
function trendFactor(series) {
  if (series.length < 14) return 1;
  const half = Math.floor(series.length / 2);
  const older = mean(series.slice(0, half).map((s) => s.units));
  const recent = mean(series.slice(half).map((s) => s.units));
  if (older <= 0) return 1;
  return Math.max(0.7, Math.min(1.4, recent / older));
}

/**
 * Recency-weighted baseline daily demand: more recent days count more
 * (linear weights). This is the level the seasonality/trend modulate.
 */
function weightedDailyMean(series) {
  if (!series.length) return 0;
  let wsum = 0;
  let vsum = 0;
  series.forEach((s, i) => {
    const w = i + 1; // oldest=1 … newest=length
    wsum += w;
    vsum += w * s.units;
  });
  return wsum ? vsum / wsum : 0;
}

/**
 * Core prediction — the swappable seam. Given a daily history series, project
 * per-day expected demand over the horizon plus uncertainty.
 * @returns {{dailyMean, std, trend, perDay: Array<{date, expected}>, total, confidence}}
 */
function predictDemand(series, { horizonDays = DEFAULTS.horizonDays, now = new Date() } = {}) {
  const dailyMean = weightedDailyMean(series);
  const std = stdDev(series.map((s) => s.units));
  const factors = weekdayFactors(series);
  const trend = trendFactor(series);

  const nonZeroDays = series.filter((s) => s.units > 0).length;
  const confidence = nonZeroDays >= 20 ? 'high' : nonZeroDays >= 7 ? 'medium' : 'low';

  const end = startOfDay(now);
  const perDay = [];
  for (let i = 1; i <= horizonDays; i++) {
    const d = new Date(end.getTime() + i * DAY_MS);
    const expected = dailyMean * factors[d.getDay()] * trend;
    perDay.push({ date: ymd(d), expected: Math.round(expected * 100) / 100 });
  }
  const total = perDay.reduce((a, b) => a + b.expected, 0);

  return {
    dailyMean: Math.round(dailyMean * 100) / 100,
    std: Math.round(std * 100) / 100,
    trend: Math.round(trend * 100) / 100,
    perDay,
    total: Math.round(total * 100) / 100,
    confidence,
  };
}

/**
 * Compare a forecast against current stock and recommend action.
 * @returns {{coverageDays, expectedHorizon, safetyStock, requiredUnits, suggestedRestock, riskLevel}}
 */
function assessShortage(forecast, currentStock, opts = {}) {
  const { horizonDays = DEFAULTS.horizonDays, leadTimeDays = DEFAULTS.leadTimeDays, serviceZ = DEFAULTS.serviceZ } = opts;
  const dailyMean = forecast.dailyMean || 0;
  const expectedHorizon = forecast.total || 0;

  // Safety stock covers demand variability over the lead time.
  const safetyStock = Math.round(serviceZ * forecast.std * Math.sqrt(Math.max(leadTimeDays, 1)));
  const requiredUnits = Math.ceil(expectedHorizon + safetyStock);
  const suggestedRestock = Math.max(0, requiredUnits - currentStock);
  const coverageDays = dailyMean > 0 ? Math.round((currentStock / dailyMean) * 10) / 10 : null;

  // Expected demand over just the lead time — if stock can't cover that, it's critical.
  const leadTimeDemand = dailyMean * leadTimeDays;

  let riskLevel;
  if (dailyMean <= 0) {
    riskLevel = 'none'; // no historical demand for this group
  } else if (currentStock <= 0 || currentStock < leadTimeDemand) {
    riskLevel = 'critical';
  } else if (currentStock < expectedHorizon) {
    riskLevel = 'at-risk';
  } else if (currentStock < requiredUnits) {
    riskLevel = 'watch';
  } else {
    riskLevel = 'ok';
  }

  return { coverageDays, expectedHorizon, safetyStock, requiredUnits, suggestedRestock, riskLevel };
}

const RISK_ORDER = { critical: 0, 'at-risk': 1, watch: 2, ok: 3, none: 4 };

// ---- DB-backed entry point ----

/**
 * Forecast demand + shortage risk per blood group for a hospital (or the whole
 * network when hospitalId is falsy). Returns rows sorted most-urgent first.
 */
async function forecastForHospital(hospitalId, options = {}) {
  const historyDays = options.historyDays || DEFAULTS.historyDays;
  const horizonDays = options.horizonDays || DEFAULTS.horizonDays;
  const now = new Date();
  const since = new Date(now.getTime() - historyDays * DAY_MS);

  const reqMatch = { resourceType: 'blood', createdAt: { $gte: since } };
  const stockMatch = { resourceType: 'blood' };
  if (hospitalId) {
    reqMatch.$or = [{ allocatedHospitalId: oid(hospitalId) }, { preferredHospitalId: oid(hospitalId) }];
    stockMatch.hospitalId = oid(hospitalId);
  }

  const [requests, stockRows, hospital] = await Promise.all([
    PatientRequest.find(reqMatch).select('bloodGroup units createdAt').lean(),
    Inventory.aggregate([
      { $match: stockMatch },
      { $group: { _id: '$bloodGroup', units: { $sum: '$units' } } },
    ]),
    hospitalId ? Hospital.findById(hospitalId).select('profile').lean() : null,
  ]);

  const stockByGroup = Object.fromEntries(stockRows.map((r) => [r._id, r.units]));
  const reqByGroup = Object.fromEntries(BLOOD_GROUPS.map((g) => [g, []]));
  for (const r of requests) {
    if (reqByGroup[r.bloodGroup]) reqByGroup[r.bloodGroup].push(r);
  }

  // Historical daily series per group (also feeds the ML "recent" window and the
  // std used for safety stock in either engine).
  const seriesByGroup = Object.fromEntries(
    BLOOD_GROUPS.map((g) => [g, buildDailySeries(reqByGroup[g], { days: historyDays, now })])
  );

  // Try the XGBoost service for the whole hospital in one call; null on any
  // failure/timeout → we fall back to the in-process heuristic per group.
  const profile = (hospital && hospital.profile) || {};
  const mlBatch = await demandModel.predictBatch(
    profile,
    BLOOD_GROUPS.map((g) => ({ bloodGroup: g, recent: seriesByGroup[g].map((s) => s.units) })),
    horizonDays
  );

  let engine = mlBatch ? 'xgboost' : 'heuristic';

  const groups = BLOOD_GROUPS.map((group) => {
    const series = seriesByGroup[group];
    const std = stdDev(series.map((s) => s.units));
    const ml = mlBatch && mlBatch.byGroup[group];

    let forecast;
    if (ml) {
      forecast = {
        dailyMean: ml.dailyMean,
        total: ml.total,
        std,
        perDay: ml.perDay,
        confidence: 'model',
        trend: null,
        source: 'xgboost',
      };
    } else {
      const h = predictDemand(series, { horizonDays, now });
      forecast = { ...h, source: 'heuristic' };
    }

    const currentStock = stockByGroup[group] || 0;
    const shortage = assessShortage(forecast, currentStock, { horizonDays });
    return {
      bloodGroup: group,
      currentStock,
      forecast: {
        dailyMean: forecast.dailyMean,
        horizonTotal: forecast.total,
        confidence: forecast.confidence,
        trend: forecast.trend,
        perDay: forecast.perDay,
        source: forecast.source,
      },
      ...shortage,
    };
  }).sort((a, b) => RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel] || b.suggestedRestock - a.suggestedRestock);

  const atRisk = groups.filter((g) => g.riskLevel === 'critical' || g.riskLevel === 'at-risk');

  return {
    scope: hospitalId ? 'hospital' : 'network',
    engine,
    modelInfo: mlBatch ? mlBatch.model : null,
    horizonDays,
    historyDays,
    generatedAt: now.toISOString(),
    totalSuggestedRestock: groups.reduce((s, g) => s + g.suggestedRestock, 0),
    atRiskGroups: atRisk.map((g) => g.bloodGroup),
    groups,
  };
}

module.exports = {
  // pure
  buildDailySeries,
  weekdayFactors,
  trendFactor,
  weightedDailyMean,
  predictDemand,
  assessShortage,
  BLOOD_GROUPS,
  DEFAULTS,
  // db
  forecastForHospital,
};
