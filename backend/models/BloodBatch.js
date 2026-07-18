const mongoose = require('mongoose');

const bloodBatchSchema = new mongoose.Schema({
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], required: true },
  units: { type: Number, required: true, min: 1 },
  collectionDate: { type: Date, default: Date.now },
  expiryDate: { type: Date, required: true },
  status: { type: String, enum: ['available', 'allocated', 'expired'], default: 'available' }
});

module.exports = mongoose.model('BloodBatch', bloodBatchSchema);