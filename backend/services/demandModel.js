/**
 * Thin client for the Python XGBoost demand-prediction service.
 *
 * The service is optional: if ML_SERVICE_URL is unset or the call fails/times
 * out, callers fall back to the in-process heuristic forecast. This keeps the
 * ML model a swappable enhancement, never a hard dependency of the API.
 */
// Accept a bare host (e.g. Render's `fromService` host property) or a full URL;
// default to https:// when no scheme is given, and strip any trailing slash.
function normalizeUrl(raw) {
  if (!raw) return '';
  let withScheme = raw;
  if (!/^https?:\/\//i.test(raw)) {
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?/i.test(raw);
    withScheme = isLocal ? `http://${raw}` : `https://${raw}`;
  }
  return withScheme.replace(/\/+$/, '');
}

const ML_SERVICE_URL = normalizeUrl(process.env.ML_SERVICE_URL || '');
const TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS) || 4000;

const isEnabled = () => Boolean(ML_SERVICE_URL);

async function postJSON(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ML_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ML service ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Forecast demand for several blood groups at one hospital.
 * @param {{hasMaternity,hasTrauma,hasPediatric,bedCount,catchmentK}} profile
 * @param {Array<{bloodGroup, recent:number[]}>} groups  recent daily demand, oldest→newest
 * @param {number} horizonDays
 * @param {{accident_index?:number, crime_index?:number}} context
 * @returns {Promise<Object|null>} map bloodGroup -> {total, dailyMean, perDay} or null on failure
 */
async function predictBatch(profile, groups, horizonDays, context = {}) {
  if (!isEnabled()) return null;
  try {
    const payload = {
      profile: {
        has_maternity: profile.hasMaternity ? 1 : 0,
        has_trauma: profile.hasTrauma ? 1 : 0,
        has_pediatric: profile.hasPediatric ? 1 : 0,
        bed_count: profile.bedCount ?? 200,
        catchment_k: profile.catchmentK ?? 200,
      },
      horizon_days: horizonDays,
      context,
      groups: groups.map((g) => ({ blood_group: g.bloodGroup, recent: g.recent })),
    };
    const data = await postJSON('/predict/batch', payload);
    const byGroup = {};
    for (const r of data.groups || []) {
      byGroup[r.blood_group] = {
        total: r.total,
        dailyMean: r.daily_mean,
        perDay: (r.per_day || []).map((p) => ({ date: p.date, expected: p.expected })),
      };
    }
    return { byGroup, model: data.model };
  } catch (err) {
    console.error('ML demand service unavailable, using heuristic:', err.message);
    return null;
  }
}

module.exports = { isEnabled, predictBatch, ML_SERVICE_URL };
