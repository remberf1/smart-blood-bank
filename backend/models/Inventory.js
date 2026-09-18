const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
  resourceType: { type: String, enum: ['blood', 'oxygen'], required: true },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  componentType: {
    type: String,
    enum: ['WHOLE_BLOOD', 'PACKED_RED_CELLS', 'PLATELET_CONCENTRATE', 'FRESH_FROZEN_PLASMA', 'CRYOPRECIPITATE'],
    default: 'PACKED_RED_CELLS',
  },
  storageTemperature: { type: String },
  units: { type: Number, default: 0 },
  oxygenCylinderCount: { type: Number, default: 0 },
  oxygenFillStatus: { type: String, enum: ['full', 'partial', 'empty'], default: 'empty' },
  lastUpdatedAt: { type: Date, default: Date.now },
  expiryAlerts: [{ bloodUnitId: String, expiryDate: Date, componentType: String }],
});

// One blood row per hospital + group + component: allows separate inventory tracking
// for Whole Blood, PRBC, Platelets, FFP, and Cryo.
inventorySchema.index(
  { hospitalId: 1, resourceType: 1, bloodGroup: 1, componentType: 1 },
  { unique: true, partialFilterExpression: { resourceType: 'blood' } }
);

module.exports = mongoose.model('Inventory', inventorySchema);