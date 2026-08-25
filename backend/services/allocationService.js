const Inventory = require('../models/Inventory');
const PatientRequest = require('../models/PatientRequest');
const { getCompatibleDonors } = require('../utils/bloodCompatibility');
const { notifyRequestStatus } = require('./notificationService');

// Lower number = higher priority
const URGENCY_PRIORITY = { emergency: 0, scheduled: 1, routine: 2 };

/**
 * Match pending blood requests to a hospital that has enough stock.
 *
 * This is a MATCHING pass only — it does not deduct inventory. Stock is
 * decremented later, atomically, when an authenticated admin marks the
 * request as 'delivered' (see routes/patientRequests.js). Auto-deducting
 * here would be unsafe because requests can be created from a public,
 * unauthenticated endpoint.
 *
 * Priority: emergency > scheduled > routine; within the same urgency,
 * older requests first (FIFO).
 */
async function allocateBlood() {
  const pending = await PatientRequest.find({
    resourceType: 'blood',
    deliveryStatus: 'pending',
  });

  pending.sort((a, b) => {
    const pa = URGENCY_PRIORITY[a.urgency] ?? 99;
    const pb = URGENCY_PRIORITY[b.urgency] ?? 99;
    if (pa !== pb) return pa - pb;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

  for (const request of pending) {
    if (!request.bloodGroup) continue;

    // A hospital can cover the request if its TOTAL compatible stock (across
    // all donor groups the patient can receive) meets the requested units.
    const compatibleGroups = getCompatibleDonors(request.bloodGroup);
    if (compatibleGroups.length === 0) continue;

    const match = {
      resourceType: 'blood',
      bloodGroup: { $in: compatibleGroups },
      units: { $gt: 0 },
    };
    // Honor the patient's preferred hospital when specified.
    if (request.preferredHospitalId) match.hospitalId = request.preferredHospitalId;

    const candidates = await Inventory.aggregate([
      { $match: match },
      { $group: { _id: '$hospitalId', total: { $sum: '$units' } } },
      { $match: { total: { $gte: request.units } } },
      { $sort: { total: -1 } }, // prefer the hospital best able to spare units
      { $limit: 1 },
    ]);

    if (candidates.length === 0) {
      // No hospital can cover it right now — leave it pending for a later pass.
      console.log(`No stock to match request ${request._id} (${request.bloodGroup} x${request.units})`);
      continue;
    }

    request.deliveryStatus = 'approved';
    request.approvedAt = new Date();
    request.allocatedHospitalId = candidates[0]._id;
    request.updatedAt = new Date();
    await request.save();

    // Best-effort: let the patient know their request was matched.
    notifyRequestStatus(request).catch(() => {});
  }
}

module.exports = { allocateBlood };
