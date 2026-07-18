const Inventory = require('../models/Inventory');
const PatientRequest = require('../models/PatientRequest');

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

    // Find inventory that can fully cover this request.
    const query = {
      resourceType: 'blood',
      bloodGroup: request.bloodGroup,
      units: { $gte: request.units },
    };
    // Honor the patient's preferred hospital when specified.
    if (request.preferredHospitalId) query.hospitalId = request.preferredHospitalId;

    // Prefer the hospital best able to spare units (highest stock).
    const inventory = await Inventory.findOne(query).sort({ units: -1 });

    if (!inventory) {
      // No hospital can cover it right now — leave it pending for a later pass.
      console.log(`No stock to match request ${request._id} (${request.bloodGroup} x${request.units})`);
      continue;
    }

    request.deliveryStatus = 'approved';
    request.approvedAt = new Date();
    request.allocatedHospitalId = inventory.hospitalId;
    request.updatedAt = new Date();
    await request.save();
    // TODO: notify patient/hospital (WhatsApp) once messaging is wired in.
  }
}

module.exports = { allocateBlood };
