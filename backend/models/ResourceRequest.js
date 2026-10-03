const mongoose = require('mongoose');

const resourceRequestSchema = new mongoose.Schema({
  requestingHospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
  supplyingHospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
  resourceType: { type: String, enum: ['blood', 'oxygen'], required: true },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  units: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'dispatched', 'completed', 'declined', 'cancelled'],
    default: 'pending',
  },
  componentType: {
    type: String,
    enum: ['WHOLE_BLOOD', 'PACKED_RED_CELLS', 'PLATELET_CONCENTRATE', 'FRESH_FROZEN_PLASMA', 'CRYOPRECIPITATE'],
    default: 'PACKED_RED_CELLS',
  },
  requestedAt: { type: Date, default: Date.now },
  respondedAt: { type: Date },
  respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dispatchedAt: { type: Date },
  dispatchedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  courierName: { type: String },
  trackingNumber: { type: String },
  coldBoxSealNumber: { type: String },
  dispatchNotes: { type: String },
  completedAt: { type: Date },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receivedNotes: { type: String },
  temperatureOnArrival: { type: Number },
  intakeVerified: { type: Boolean, default: false },
  cancelledAt: { type: Date },
  notes: { type: String },
});

module.exports = mongoose.model('ResourceRequest', resourceRequestSchema);