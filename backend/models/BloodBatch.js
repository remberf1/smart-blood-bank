const mongoose = require('mongoose');

const bloodBatchSchema = new mongoose.Schema({
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], required: true },
  componentType: {
    type: String,
    enum: ['WHOLE_BLOOD', 'PACKED_RED_CELLS', 'PLATELET_CONCENTRATE', 'FRESH_FROZEN_PLASMA', 'CRYOPRECIPITATE'],
    default: 'PACKED_RED_CELLS',
    required: true,
  },
  volumeMl: { type: Number },
  storageTemperature: { type: String },
  // The donor this batch came from (traceability). Null for manual stock entries.
  donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donor' },
  source: { type: String, enum: ['donation', 'manual'], default: 'manual' },
  // Units remaining in this batch (0 once fully consumed/discarded/expired).
  units: { type: Number, required: true, min: 0 },
  // Units originally collected/added (preserves historical metrics after units are consumed).
  initialUnits: { type: Number, required: true, min: 1 },
  collectionDate: { type: Date, default: Date.now },
  expiryDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['available', 'allocated', 'expired', 'discarded'],
    default: 'available',
  },
});

// Supports FEFO selection, component segregation, and the expiry sweep.
bloodBatchSchema.index({ hospitalId: 1, bloodGroup: 1, componentType: 1, status: 1, expiryDate: 1 });

module.exports = mongoose.model('BloodBatch', bloodBatchSchema);
