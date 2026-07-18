const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
  resourceType: { type: String, enum: ['blood', 'oxygen'], required: true },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  units: { type: Number, default: 0 },
  oxygenCylinderCount: { type: Number, default: 0 },
  oxygenFillStatus: { type: String, enum: ['full', 'partial', 'empty'], default: 'empty' },
  lastUpdatedAt: { type: Date, default: Date.now },
  expiryAlerts: [{ bloodUnitId: String, expiryDate: Date }]
});

// One blood row per hospital+group: keeps the donation upsert race-safe and
// stops the WPS aggregation from double-counting. Oxygen rows have a null
// bloodGroup, so the partial filter leaves them unconstrained.
inventorySchema.index(
  { hospitalId: 1, resourceType: 1, bloodGroup: 1 },
  { unique: true, partialFilterExpression: { resourceType: 'blood' } }
);

module.exports = mongoose.model('Inventory', inventorySchema);