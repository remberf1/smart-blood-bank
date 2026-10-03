const mongoose = require('mongoose');

const sosRequestSchema = new mongoose.Schema({
  bloodGroup: { type: String, required: true },
  userLocation: {
    lat: Number,
    lon: Number
  },
  userPhone: { type: String },
  referenceId: { type: String, sparse: true, index: true },
  doctorName: { type: String },
  doctorPhone: { type: String },
  hospitalName: { type: String },
  componentNeeded: { type: String, default: 'WHOLE_BLOOD' },
  radiusKm: { type: Number, default: 15 },
  tier: { type: String, enum: ['clinical', 'public'], default: 'public' },
  authCode: { type: String },
  hospitalTriageStatus: {
    type: String,
    enum: ['pending_verification', 'verified_broadcasted', 'dispatched_ambulance', 'cancelled'],
    default: 'pending_verification',
  },
  donorsAlerted: [{ donorId: mongoose.Schema.Types.ObjectId, phone: String, status: String }],
  donorsResponded: [{ donorId: mongoose.Schema.Types.ObjectId, response: String, timestamp: Date }],
  hospitalNotified: [{ hospitalId: mongoose.Schema.Types.ObjectId }],
  status: { type: String, enum: ['pending', 'resolved', 'expired'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SOSRequest', sosRequestSchema);