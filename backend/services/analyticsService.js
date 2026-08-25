const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const BloodBatch = require('../models/BloodBatch');
const PatientRequest = require('../models/PatientRequest');
const Donor = require('../models/Donor');

const DAY_MS = 24 * 60 * 60 * 1000;
const oid = (id) => new mongoose.Types.ObjectId(id);
const toMap = (rows) => Object.fromEntries(rows.map((r) => [r._id ?? 'unknown', r.count]));

/**
 * Pure summary of a list of requests. Testable without a DB.
 * @param {Array<{deliveryStatus, createdAt, deliveredAt}>} requests
 */
function summarizeRequests(requests) {
  const total = requests.length;
  const delivered = requests.filter((r) => r.deliveryStatus === 'delivered');
  const times = delivered
    .filter((r) => r.deliveredAt)
    .map((r) => (new Date(r.deliveredAt).getTime() - new Date(r.createdAt).getTime()) / (60 * 60 * 1000));
  const avgDeliveryHours = times.length
    ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10
    : null;
  return {
    total,
    delivered: delivered.length,
    fulfillmentRate: total ? Math.round((delivered.length / total) * 1000) / 1000 : 0,
    avgDeliveryHours,
  };
}

// Available blood units per group. hospitalId null = network-wide.
async function stockByGroup(hospitalId) {
  const match = { resourceType: 'blood', units: { $gt: 0 } };
  if (hospitalId) match.hospitalId = oid(hospitalId);
  const rows = await Inventory.aggregate([
    { $match: match },
    { $group: { _id: '$bloodGroup', units: { $sum: '$units' } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ bloodGroup: r._id, units: r.units }));
}

async function donationStats(hospitalId, days = 30) {
  const since = new Date(Date.now() - days * DAY_MS);
  const match = { source: 'donation', collectionDate: { $gte: since } };
  if (hospitalId) match.hospitalId = oid(hospitalId);

  const [byGroup, byDay, total] = await Promise.all([
    BloodBatch.aggregate([
      { $match: match },
      { $group: { _id: '$bloodGroup', units: { $sum: '$units' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    BloodBatch.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$collectionDate' } }, units: { $sum: '$units' } } },
      { $sort: { _id: 1 } },
    ]),
    BloodBatch.aggregate([{ $match: match }, { $group: { _id: null, units: { $sum: '$units' }, count: { $sum: 1 } } }]),
  ]);

  return {
    periodDays: days,
    totalUnits: total[0]?.units || 0,
    totalDonations: total[0]?.count || 0,
    byGroup: byGroup.map((g) => ({ bloodGroup: g._id, units: g.units, count: g.count })),
    byDay: byDay.map((d) => ({ date: d._id, units: d.units })),
  };
}

async function requestStats(hospitalId, days = 30) {
  const since = new Date(Date.now() - days * DAY_MS);
  const match = { createdAt: { $gte: since } };
  if (hospitalId) match.$or = [{ allocatedHospitalId: oid(hospitalId) }, { preferredHospitalId: oid(hospitalId) }];

  const [byStatus, byUrgency, list] = await Promise.all([
    PatientRequest.aggregate([{ $match: match }, { $group: { _id: '$deliveryStatus', count: { $sum: 1 } } }]),
    PatientRequest.aggregate([{ $match: match }, { $group: { _id: '$urgency', count: { $sum: 1 } } }]),
    PatientRequest.find(match).select('deliveryStatus createdAt deliveredAt').lean(),
  ]);

  return {
    periodDays: days,
    ...summarizeRequests(list),
    byStatus: toMap(byStatus),
    byUrgency: toMap(byUrgency),
  };
}

async function wastageStats(hospitalId, days = 30) {
  const since = new Date(Date.now() - days * DAY_MS);
  const match = { status: 'expired', collectionDate: { $gte: since } };
  if (hospitalId) match.hospitalId = oid(hospitalId);

  const [expired, donated] = await Promise.all([
    BloodBatch.aggregate([{ $match: match }, { $group: { _id: null, units: { $sum: '$units' }, count: { $sum: 1 } } }]),
    BloodBatch.aggregate([
      { $match: { source: 'donation', collectionDate: { $gte: since }, ...(hospitalId ? { hospitalId: oid(hospitalId) } : {}) } },
      { $group: { _id: null, units: { $sum: '$units' } } },
    ]),
  ]);

  const expiredUnits = expired[0]?.units || 0;
  const donatedUnits = donated[0]?.units || 0;
  return {
    periodDays: days,
    expiredUnits,
    expiredBatches: expired[0]?.count || 0,
    // wastage as a share of what was collected in the window
    wastageRate: donatedUnits ? Math.round((expiredUnits / donatedUnits) * 1000) / 1000 : 0,
  };
}

// Donors are not hospital-scoped, so these are network-wide.
async function donorStats() {
  const [byStatus, byGroup, total] = await Promise.all([
    Donor.aggregate([{ $group: { _id: '$eligibilityStatus', count: { $sum: 1 } } }]),
    Donor.aggregate([{ $group: { _id: '$bloodGroup', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Donor.countDocuments({}),
  ]);
  const statusMap = toMap(byStatus);
  return {
    total,
    eligible: statusMap.eligible || 0,
    deferred: statusMap.deferred || 0,
    byGroup: byGroup.map((g) => ({ bloodGroup: g._id, count: g.count })),
  };
}

// Headline KPIs.
async function summary(hospitalId) {
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * DAY_MS);
  const expiringMatch = { status: 'available', expiryDate: { $gt: now, $lte: soon } };
  const pendingMatch = { deliveryStatus: 'pending' };
  if (hospitalId) {
    expiringMatch.hospitalId = oid(hospitalId);
    pendingMatch.$or = [{ allocatedHospitalId: oid(hospitalId) }, { preferredHospitalId: oid(hospitalId) }];
  }

  const [stock, donations, requests, wastage, donors, expiringUnits, pending] = await Promise.all([
    stockByGroup(hospitalId),
    donationStats(hospitalId, 30),
    requestStats(hospitalId, 30),
    wastageStats(hospitalId, 30),
    donorStats(),
    BloodBatch.aggregate([{ $match: expiringMatch }, { $group: { _id: null, units: { $sum: '$units' } } }]),
    PatientRequest.countDocuments(pendingMatch),
  ]);

  return {
    scope: hospitalId ? 'hospital' : 'network',
    totalStockUnits: stock.reduce((s, r) => s + r.units, 0),
    stockByGroup: stock,
    expiringSoonUnits: expiringUnits[0]?.units || 0,
    pendingRequests: pending,
    donationsLast30d: donations.totalUnits,
    fulfillmentRate: requests.fulfillmentRate,
    avgDeliveryHours: requests.avgDeliveryHours,
    wastageUnits30d: wastage.expiredUnits,
    wastageRate30d: wastage.wastageRate,
    donors: { total: donors.total, eligible: donors.eligible, deferred: donors.deferred },
  };
}

module.exports = {
  summarizeRequests,
  stockByGroup,
  donationStats,
  requestStats,
  wastageStats,
  donorStats,
  summary,
};
