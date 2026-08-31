const mongoose = require('mongoose');
const BloodBatch = require('../models/BloodBatch');
const Inventory = require('../models/Inventory');
const { getCompatibleDonors } = require('../utils/bloodCompatibility');

// Red-cell shelf life. Kept here so it's easy to change / make configurable.
const SHELF_LIFE_DAYS = 42;
const DAY_MS = 24 * 60 * 60 * 1000;

function toObjectId(id) {
  return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id);
}

/**
 * Pure FEFO (first-expiry-first-out) selection. Given the available batches
 * and units needed, return which batches to draw from. No DB access — unit
 * tested directly.
 * @param {Array<{_id:any, units:number, expiryDate:Date, donorId?:any}>} batches
 * @param {number} unitsNeeded
 * @returns {{ allocations: Array<{batchId,donorId,units}>, allocated: number, shortfall: number }}
 */
function selectFEFO(batches, unitsNeeded) {
  const sorted = [...batches].sort(
    (a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)
  );
  const allocations = [];
  let remaining = unitsNeeded;
  for (const b of sorted) {
    if (remaining <= 0) break;
    if (b.units <= 0) continue;
    const take = Math.min(b.units, remaining);
    allocations.push({ batchId: b._id, donorId: b.donorId || null, units: take });
    remaining -= take;
  }
  return {
    allocations,
    allocated: unitsNeeded - Math.max(0, remaining),
    shortfall: Math.max(0, remaining),
  };
}

/**
 * Comparator that orders batches by donor-group preference (index in the
 * `preference` list), then by soonest expiry (FEFO) within a group.
 */
function batchPreferenceComparator(preference) {
  const rank = {};
  preference.forEach((g, i) => { rank[g] = i; });
  return (a, b) => {
    const ra = rank[a.bloodGroup] ?? Number.MAX_SAFE_INTEGER;
    const rb = rank[b.bloodGroup] ?? Number.MAX_SAFE_INTEGER;
    return ra - rb || new Date(a.expiryDate) - new Date(b.expiryDate);
  };
}

/**
 * Pure compatibility-aware selection. Given available batches (each with
 * bloodGroup/units/expiryDate/donorId), units needed, and a preference-ordered
 * list of acceptable donor groups, pick which batches to draw. Exact/preferred
 * groups are consumed before universal ones; FEFO within each group.
 * @returns {{ allocations, allocated, shortfall }}
 */
function selectCompatible(batches, unitsNeeded, preference) {
  const acceptable = new Set(preference);
  const sorted = batches
    .filter((b) => b.units > 0 && acceptable.has(b.bloodGroup))
    .sort(batchPreferenceComparator(preference));

  const allocations = [];
  let remaining = unitsNeeded;
  for (const b of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(b.units, remaining);
    allocations.push({
      batchId: b._id,
      donorId: b.donorId || null,
      bloodGroup: b.bloodGroup,
      units: take,
    });
    remaining -= take;
  }
  return {
    allocations,
    allocated: unitsNeeded - Math.max(0, remaining),
    shortfall: Math.max(0, remaining),
  };
}

/**
 * Recompute the Inventory cache (units) for a hospital+blood group as the sum
 * of available, non-expired batch units, and upsert the row.
 */
async function refreshBloodInventory(hospitalId, bloodGroup) {
  const now = new Date();
  const agg = await BloodBatch.aggregate([
    {
      $match: {
        hospitalId: toObjectId(hospitalId),
        bloodGroup,
        status: 'available',
        expiryDate: { $gt: now },
      },
    },
    { $group: { _id: null, units: { $sum: '$units' } } },
  ]);
  const units = agg[0]?.units || 0;
  await Inventory.findOneAndUpdate(
    { hospitalId, resourceType: 'blood', bloodGroup },
    { $set: { units, lastUpdatedAt: now } },
    { upsert: true }
  );
  return units;
}

/** Add blood units as a new dated batch, then refresh the cache. */
async function addBloodUnits({ hospitalId, bloodGroup, units, donorId = null, source = 'manual' }) {
  if (!units || units <= 0) {
    return refreshBloodInventory(hospitalId, bloodGroup);
  }
  const now = new Date();
  await BloodBatch.create({
    hospitalId,
    bloodGroup,
    donorId,
    source,
    units,
    collectionDate: now,
    expiryDate: new Date(now.getTime() + SHELF_LIFE_DAYS * DAY_MS),
    status: 'available',
  });
  return refreshBloodInventory(hospitalId, bloodGroup);
}

/**
 * Discard units for a manual downward correction (FEFO). Returns the shortfall
 * (units that could not be removed because stock was lower).
 */
async function removeBloodUnits({ hospitalId, bloodGroup, units }) {
  const now = new Date();
  const batches = await BloodBatch.find({
    hospitalId,
    bloodGroup,
    status: 'available',
    expiryDate: { $gt: now },
  }).sort({ expiryDate: 1 });

  let remaining = units;
  for (const b of batches) {
    if (remaining <= 0) break;
    const take = Math.min(b.units, remaining);
    b.units -= take;
    remaining -= take;
    if (b.units === 0) b.status = 'discarded';
    await b.save();
  }
  await refreshBloodInventory(hospitalId, bloodGroup);
  return Math.max(0, remaining);
}

/**
 * Consume units for a patient needing `bloodGroup`, drawing from all
 * compatible donor groups (exact/same-ABO first, universal last), FEFO within
 * each. Marks depleted batches allocated and returns the fulfilled
 * batch/donor/group breakdown for traceability. Fails (ok:false) without
 * consuming anything if compatible non-expired stock is insufficient.
 */
async function consumeBloodFEFO({ hospitalId, bloodGroup, units }) {
  const now = new Date();
  const preference = getCompatibleDonors(bloodGroup);
  if (preference.length === 0) return { ok: false, shortfall: units };

  const batches = await BloodBatch.find({
    hospitalId,
    bloodGroup: { $in: preference },
    status: 'available',
    expiryDate: { $gt: now },
  });

  const plan = selectCompatible(batches, units, preference);
  if (plan.shortfall > 0) return { ok: false, shortfall: plan.shortfall };

  const byId = new Map(batches.map((b) => [b._id.toString(), b]));
  const touchedGroups = new Set();
  const fulfilledBatches = [];
  for (const a of plan.allocations) {
    const b = byId.get(a.batchId.toString());
    b.units -= a.units;
    if (b.units === 0) b.status = 'allocated';
    await b.save();
    touchedGroups.add(b.bloodGroup);
    fulfilledBatches.push({
      batchId: b._id,
      donorId: b.donorId || null,
      bloodGroup: b.bloodGroup,
      units: a.units,
    });
  }

  for (const g of touchedGroups) {
    await refreshBloodInventory(hospitalId, g);
  }
  return { ok: true, fulfilledBatches };
}

function isTransactionUnsupported(err) {
  return (
    !!err &&
    (err.code === 20 ||
      /Transaction numbers are only allowed on a replica set|replica set|Transactions are not supported/i.test(
        err.message || ''
      ))
  );
}

/**
 * Atomically fulfill a delivered blood request: consume compatible batches
 * (FEFO) AND mark the request delivered + record fulfilledBatches in ONE
 * transaction — so stock cannot be oversold under concurrency, and a retry
 * after a mid-way failure cannot double-consume (the delivered flag and the
 * batch decrements commit together or not at all).
 *
 * Falls back to a best-effort non-transactional path only when transactions
 * are unavailable (e.g. a standalone mongod in local dev).
 *
 * @param request a PatientRequest mongoose document (mutated + saved on success)
 * @returns {Promise<{ok:true, fulfilledBatches}|{ok:false, shortfall:number}>}
 */
async function consumeForDelivery(request) {
  const preference = getCompatibleDonors(request.bloodGroup);
  if (preference.length === 0) return { ok: false, shortfall: request.units };

  try {
    return await consumeForDeliveryTxn(request, preference);
  } catch (err) {
    if (isTransactionUnsupported(err)) {
      console.warn(
        'MongoDB transactions unavailable; using non-transactional delivery (possible oversell under heavy concurrency).'
      );
      return consumeForDeliveryFallback(request);
    }
    throw err;
  }
}

async function consumeForDeliveryTxn(request, preference) {
  const session = await mongoose.startSession();
  let outcome = null;
  const touched = new Set();
  try {
    await session.withTransaction(async () => {
      // withTransaction may re-run this callback on transient conflicts, so
      // reset per-attempt state and re-read the batches inside the session.
      outcome = null;
      touched.clear();
      const now = new Date();
      const batches = await BloodBatch.find({
        hospitalId: request.allocatedHospitalId,
        bloodGroup: { $in: preference },
        status: 'available',
        expiryDate: { $gt: now },
      }).session(session);

      const plan = selectCompatible(batches, request.units, preference);
      if (plan.shortfall > 0) {
        outcome = { ok: false, shortfall: plan.shortfall };
        return; // nothing written — empty commit
      }

      const byId = new Map(batches.map((b) => [b._id.toString(), b]));
      const fulfilled = [];
      for (const a of plan.allocations) {
        const b = byId.get(a.batchId.toString());
        b.units -= a.units;
        if (b.units === 0) b.status = 'allocated';
        await b.save({ session });
        touched.add(b.bloodGroup);
        fulfilled.push({ batchId: b._id, donorId: b.donorId || null, bloodGroup: b.bloodGroup, units: a.units });
      }

      request.fulfilledBatches = fulfilled;
      request.deliveryStatus = 'delivered';
      request.deliveredAt = new Date();
      request.updatedAt = new Date();
      await request.save({ session });
      outcome = { ok: true, fulfilledBatches: fulfilled };
    });
  } finally {
    await session.endSession();
  }

  if (outcome && outcome.ok) {
    for (const g of touched) await refreshBloodInventory(request.allocatedHospitalId, g);
  }
  return outcome;
}

async function consumeForDeliveryFallback(request) {
  const res = await consumeBloodFEFO({
    hospitalId: request.allocatedHospitalId,
    bloodGroup: request.bloodGroup,
    units: request.units,
  });
  if (!res.ok) return res;
  request.fulfilledBatches = res.fulfilledBatches;
  request.deliveryStatus = 'delivered';
  request.deliveredAt = new Date();
  request.updatedAt = new Date();
  await request.save();
  return { ok: true, fulfilledBatches: res.fulfilledBatches };
}

/** Mark all due batches expired and refresh affected caches. Returns count. */
async function expireDueBatches() {
  const now = new Date();
  const due = await BloodBatch.find({ status: 'available', expiryDate: { $lte: now } });
  const affected = new Set();
  for (const b of due) {
    b.status = 'expired';
    await b.save();
    affected.add(`${b.hospitalId.toString()}|${b.bloodGroup}`);
  }
  for (const key of affected) {
    const [hospitalId, bloodGroup] = key.split('|');
    await refreshBloodInventory(hospitalId, bloodGroup);
  }
  return due.length;
}

module.exports = {
  SHELF_LIFE_DAYS,
  selectFEFO,
  selectCompatible,
  consumeForDelivery,
  refreshBloodInventory,
  addBloodUnits,
  removeBloodUnits,
  consumeBloodFEFO,
  expireDueBatches,
};
