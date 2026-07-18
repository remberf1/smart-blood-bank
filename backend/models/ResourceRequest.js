const mongoose = require('mongoose');

const resourceRequestSchema = new mongoose.Schema({
  requestingHospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
  supplyingHospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
  resourceType: { type: String, enum: ['blood', 'oxygen'], required: true },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  units: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'declined', 'completed', 'cancelled'],
    default: 'pending',
  },
  requestedAt: { type: Date, default: Date.now },
  respondedAt: { type: Date },
  completedAt: { type: Date },
  notes: { type: String },
});

module.exports = mongoose.model('ResourceRequest', resourceRequestSchema);