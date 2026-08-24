const mongoose = require('mongoose');

const bloodBatchSchema = new mongoose.Schema({
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], required: true },
  // The donor this batch came from (traceability). Null for manual stock entries.
  donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donor' },
  source: { type: String, enum: ['donation', 'manual'], default: 'manual' },
  // Units remaining in this batch (0 once fully consumed/discarded/expired).
  units: { type: Number, required: true, min: 0 },
  collectionDate: { type: Date, default: Date.now },
  expiryDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['available', 'allocated', 'expired', 'discarded'],
    default: 'available',
  },
});

// Supports FEFO selection and the expiry sweep.
bloodBatchSchema.index({ hospitalId: 1, bloodGroup: 1, status: 1, expiryDate: 1 });

module.exports = mongoose.model('BloodBatch', bloodBatchSchema);
