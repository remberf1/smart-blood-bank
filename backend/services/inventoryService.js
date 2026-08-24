const mongoose = require('mongoose');
const BloodBatch = require('../models/BloodBatch');
const Inventory = require('../models/Inventory');

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
 * Consume units for a patient (FEFO), marking depleted batches allocated and
 * returning the fulfilled batch/donor breakdown for traceability. Fails
 * (ok:false) without consuming anything if there isn't enough non-expired stock.
 */
async function consumeBloodFEFO({ hospitalId, bloodGroup, units }) {
  const now = new Date();
  const batches = await BloodBatch.find({
    hospitalId,
    bloodGroup,
    status: 'available',
    expiryDate: { $gt: now },
  }).sort({ expiryDate: 1 });

  const total = batches.reduce((s, b) => s + b.units, 0);
  if (total < units) return { ok: false, shortfall: units - total };

  let remaining = units;
  const fulfilledBatches = [];
  for (const b of batches) {
    if (remaining <= 0) break;
    const take = Math.min(b.units, remaining);
    b.units -= take;
    remaining -= take;
    if (b.units === 0) b.status = 'allocated';
    await b.save();
    fulfilledBatches.push({ batchId: b._id, donorId: b.donorId || null, units: take });
  }
  await refreshBloodInventory(hospitalId, bloodGroup);
  return { ok: true, fulfilledBatches };
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
  refreshBloodInventory,
  addBloodUnits,
  removeBloodUnits,
  consumeBloodFEFO,
  expireDueBatches,
};
