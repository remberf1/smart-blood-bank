const mongoose = require('mongoose');
const BloodBatch = require('../models/BloodBatch');
const Inventory = require('../models/Inventory');
const { getCompatibleDonors, COMPONENT_RULES } = require('../utils/bloodCompatibility');

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
 * Recompute the Inventory cache (units) for a hospital + blood group + component
 * as the sum of available, non-expired batch units, and upsert the row.
 */
async function refreshBloodInventory(hospitalId, bloodGroup, componentType = 'PACKED_RED_CELLS') {
  const now = new Date();
  const rules = COMPONENT_RULES[componentType] || COMPONENT_RULES.PACKED_RED_CELLS;
  const agg = await BloodBatch.aggregate([
    {
      $match: {
        hospitalId: toObjectId(hospitalId),
        bloodGroup,
        componentType,
        status: 'available',
        expiryDate: { $gt: now },
      },
    },
    { $group: { _id: null, units: { $sum: '$units' } } },
  ]);
  const units = agg[0]?.units || 0;
  await Inventory.findOneAndUpdate(
    { hospitalId: toObjectId(hospitalId), resourceType: 'blood', bloodGroup, componentType },
    { $set: { units, storageTemperature: rules.storageTemp, lastUpdatedAt: now } },
    { upsert: true }
  );
  return units;
}

/** Add blood units as a new dated batch, then refresh the cache. */
async function addBloodUnits({ hospitalId, bloodGroup, units, componentType = 'PACKED_RED_CELLS', donorId = null, source = 'manual' }) {
  if (!units || units <= 0) {
    return refreshBloodInventory(hospitalId, bloodGroup, componentType);
  }
  const rules = COMPONENT_RULES[componentType] || COMPONENT_RULES.PACKED_RED_CELLS;
  const now = new Date();
  await BloodBatch.create({
    hospitalId: toObjectId(hospitalId),
    bloodGroup,
    componentType,
    volumeMl: rules.volumeMl,
    storageTemperature: rules.storageTemp,
    donorId: donorId ? toObjectId(donorId) : null,
    source,
    units,
    initialUnits: units,
    collectionDate: now,
    expiryDate: new Date(now.getTime() + rules.shelfLifeDays * DAY_MS),
    status: 'available',
  });
  return refreshBloodInventory(hospitalId, bloodGroup, componentType);
}

/**
 * Discard units for a manual downward correction (FEFO). Returns the shortfall
 * (units that could not be removed because stock was lower).
 */
async function removeBloodUnits({ hospitalId, bloodGroup, units, componentType = 'PACKED_RED_CELLS' }) {
  const now = new Date();
  const batches = await BloodBatch.find({
    hospitalId: toObjectId(hospitalId),
    bloodGroup,
    componentType,
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
  await refreshBloodInventory(hospitalId, bloodGroup, componentType);
  return Math.max(0, remaining);
}

/**
 * Consume units for a patient needing `bloodGroup` and `componentType`,
 * drawing from all compatible donor groups (exact/same-ABO first, universal last),
 * FEFO within each. Fails (ok:false) without consuming anything if compatible
 * non-expired stock is insufficient.
 */
async function consumeBloodFEFO({ hospitalId, bloodGroup, units, componentType = 'PACKED_RED_CELLS' }) {
  const now = new Date();
  const preference = getCompatibleDonors(bloodGroup, componentType);
  if (preference.length === 0) return { ok: false, shortfall: units };

  const batches = await BloodBatch.find({
    hospitalId: toObjectId(hospitalId),
    bloodGroup: { $in: preference },
    componentType,
    status: 'available',
    expiryDate: { $gt: now },
  });

  const plan = selectCompatible(batches, units, preference);
  if (plan.shortfall > 0) {
    return { ok: false, shortfall: plan.shortfall, allocated: plan.allocated };
  }

  for (const a of plan.allocations) {
    const b = batches.find((x) => x._id.equals(a.batchId));
    if (!b) continue;
    b.units -= a.units;
    if (b.units === 0) b.status = 'allocated';
    await b.save();
  }

  const affectedGroups = new Set(plan.allocations.map((a) => a.bloodGroup));
  for (const g of affectedGroups) {
    await refreshBloodInventory(hospitalId, g, componentType);
  }

  return { ok: true, fulfilledBatches: plan.allocations };
}

/**
 * Convenience wrapper used by the delivery confirmation flow: draws the
 * units for `request` via FEFO from `request.allocatedHospitalId`, records
 * the batch allocation and delivery status on the request, and returns.
 */
async function consumeForDelivery(request) {
  if (request.resourceType !== 'blood') return { ok: true };
  if (request.deliveryStatus === 'delivered') return { ok: true };
  if (!request.allocatedHospitalId || !request.bloodGroup) {
    return { ok: false, error: 'Request missing hospital or blood group' };
  }
  const componentType = request.componentType || 'PACKED_RED_CELLS';
  const res = await consumeBloodFEFO({
    hospitalId: request.allocatedHospitalId,
    bloodGroup: request.bloodGroup,
    units: request.units,
    componentType,
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
    affected.add(`${b.hospitalId.toString()}|${b.bloodGroup}|${b.componentType || 'PACKED_RED_CELLS'}`);
  }
  for (const key of affected) {
    const [hospitalId, bloodGroup, componentType] = key.split('|');
    await refreshBloodInventory(hospitalId, bloodGroup, componentType);
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
