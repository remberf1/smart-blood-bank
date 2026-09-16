const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const PatientRequest = require('../models/PatientRequest');
const { getCompatibleDonors } = require('../utils/bloodCompatibility');
const { notifyRequestStatus } = require('./notificationService');

// Lower number = higher priority
const URGENCY_PRIORITY = { emergency: 0, scheduled: 1, routine: 2 };

/**
 * Match pending blood requests to a hospital that has enough stock.
 *
 * This is a MATCHING pass only — it does not deduct inventory from the database.
 * Stock is decremented later, atomically, when an authenticated admin marks the
 * request as 'delivered' (see routes/patientRequests.js).
 *
 * To avoid overselling under concurrency, this pass accounts for all currently
 * approved/in-transit requests that have already claimed stock, and deducts
 * matched units in-memory as each pending request is processed.
 *
 * Priority: emergency > scheduled > routine; within the same urgency,
 * older requests first (FIFO).
 */
async function allocateBlood() {
  const pending = await PatientRequest.find({
    resourceType: 'blood',
    deliveryStatus: 'pending',
  });

  if (pending.length === 0) return;

  pending.sort((a, b) => {
    const pa = URGENCY_PRIORITY[a.urgency] ?? 99;
    const pb = URGENCY_PRIORITY[b.urgency] ?? 99;
    if (pa !== pb) return pa - pb;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

  // 1. Fetch current inventory
  const inventoryRows = await Inventory.find({ resourceType: 'blood', units: { $gt: 0 } }).lean();

  // 2. Fetch all currently active, unfulfilled allocations (approved or in-transit)
  const committedRequests = await PatientRequest.find({
    resourceType: 'blood',
    deliveryStatus: { $in: ['approved', 'in-transit'] },
    allocatedHospitalId: { $ne: null },
  }).lean();

  // Build in-memory stock tracker: hospitalId -> bloodGroup -> remainingUnits
  const availableStock = new Map();
  for (const row of inventoryRows) {
    const hid = row.hospitalId.toString();
    if (!availableStock.has(hid)) availableStock.set(hid, new Map());
    availableStock.get(hid).set(row.bloodGroup, row.units);
  }

  // Deduct already committed units from stock
  for (const cr of committedRequests) {
    const hid = cr.allocatedHospitalId.toString();
    const groupStock = availableStock.get(hid);
    if (!groupStock) continue;

    let needed = cr.units;
    if (groupStock.has(cr.bloodGroup)) {
      const current = groupStock.get(cr.bloodGroup);
      const take = Math.min(current, needed);
      groupStock.set(cr.bloodGroup, current - take);
      needed -= take;
    }
    if (needed > 0) {
      const compatible = getCompatibleDonors(cr.bloodGroup);
      for (const cg of compatible) {
        if (needed <= 0) break;
        if (groupStock.has(cg)) {
          const current = groupStock.get(cg);
          const take = Math.min(current, needed);
          groupStock.set(cg, current - take);
          needed -= take;
        }
      }
    }
  }

  // 3. Match pending requests against net available stock
  for (const request of pending) {
    if (!request.bloodGroup) continue;
    const compatibleGroups = getCompatibleDonors(request.bloodGroup);
    if (compatibleGroups.length === 0) continue;

    let bestHospitalId = null;
    let maxSpare = -1;

    const candidateHospitals = request.preferredHospitalId
      ? [request.preferredHospitalId.toString()]
      : Array.from(availableStock.keys());

    for (const hid of candidateHospitals) {
      const groupStock = availableStock.get(hid);
      if (!groupStock) continue;

      let totalCompatible = 0;
      for (const cg of compatibleGroups) {
        totalCompatible += (groupStock.get(cg) || 0);
      }

      if (totalCompatible >= request.units && totalCompatible > maxSpare) {
        maxSpare = totalCompatible;
        bestHospitalId = hid;
      }
    }

    if (!bestHospitalId) {
      console.log(`No stock to match request ${request._id} (${request.bloodGroup} x${request.units})`);
      continue;
    }

    // Reserve stock in memory for this match
    const groupStock = availableStock.get(bestHospitalId);
    let needed = request.units;
    if (groupStock.has(request.bloodGroup)) {
      const current = groupStock.get(request.bloodGroup);
      const take = Math.min(current, needed);
      groupStock.set(request.bloodGroup, current - take);
      needed -= take;
    }
    if (needed > 0) {
      for (const cg of compatibleGroups) {
        if (needed <= 0) break;
        if (groupStock.has(cg)) {
          const current = groupStock.get(cg);
          const take = Math.min(current, needed);
          groupStock.set(cg, current - take);
          needed -= take;
        }
      }
    }

    request.deliveryStatus = 'approved';
    request.approvedAt = new Date();
    request.allocatedHospitalId = new mongoose.Types.ObjectId(bestHospitalId);
    request.updatedAt = new Date();
    await request.save();

    // Best-effort: let the patient know their request was matched.
    notifyRequestStatus(request).catch(() => {});
  }
}

/**
 * Match pending oxygen requests to a hospital that has enough oxygen cylinders.
 *
 * Matching pass only — decrements oxygen cylinders atomically on delivery.
 * Deducts in-memory committed cylinders (approved/in-transit) to avoid overselling.
 * Priority: emergency > scheduled > routine; FIFO within the same urgency.
 */
async function allocateOxygen() {
  const pending = await PatientRequest.find({
    resourceType: 'oxygen',
    deliveryStatus: 'pending',
  });

  if (pending.length === 0) return;

  pending.sort((a, b) => {
    const pa = URGENCY_PRIORITY[a.urgency] ?? 99;
    const pb = URGENCY_PRIORITY[b.urgency] ?? 99;
    if (pa !== pb) return pa - pb;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

  // 1. Fetch current oxygen inventory
  const oxygenRows = await Inventory.find({
    resourceType: 'oxygen',
    oxygenCylinderCount: { $gt: 0 },
  }).lean();

  // 2. Fetch all currently active, unfulfilled allocations (approved or in-transit)
  const committedRequests = await PatientRequest.find({
    resourceType: 'oxygen',
    deliveryStatus: { $in: ['approved', 'in-transit'] },
    allocatedHospitalId: { $ne: null },
  }).lean();

  // Map: hospitalId -> remainingCylinders
  const availableCylinders = new Map();
  for (const row of oxygenRows) {
    const hid = row.hospitalId.toString();
    availableCylinders.set(hid, (availableCylinders.get(hid) || 0) + (row.oxygenCylinderCount || 0));
  }

  // Deduct already committed cylinders
  for (const cr of committedRequests) {
    const hid = cr.allocatedHospitalId.toString();
    const current = availableCylinders.get(hid) || 0;
    availableCylinders.set(hid, Math.max(0, current - cr.units));
  }

  // 3. Match pending requests against net available cylinders
  for (const request of pending) {
    const needed = request.units || 1;
    let bestHospitalId = null;
    let maxSpare = -1;

    const candidateHospitals = request.preferredHospitalId
      ? [request.preferredHospitalId.toString()]
      : Array.from(availableCylinders.keys());

    for (const hid of candidateHospitals) {
      const available = availableCylinders.get(hid) || 0;
      if (available >= needed && available > maxSpare) {
        maxSpare = available;
        bestHospitalId = hid;
      }
    }

    if (!bestHospitalId) {
      console.log(`No oxygen cylinders available to match request ${request._id} (needed: ${needed})`);
      continue;
    }

    // Reserve cylinders in memory for this match
    const current = availableCylinders.get(bestHospitalId);
    availableCylinders.set(bestHospitalId, current - needed);

    request.deliveryStatus = 'approved';
    request.approvedAt = new Date();
    request.allocatedHospitalId = new mongoose.Types.ObjectId(bestHospitalId);
    request.updatedAt = new Date();
    await request.save();

    notifyRequestStatus(request).catch(() => {});
  }
}

module.exports = { allocateBlood, allocateOxygen };
