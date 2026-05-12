const mongoose = require('mongoose');

const sosRequestSchema = new mongoose.Schema({
  bloodGroup: { type: String, required: true },
  userLocation: {
    lat: Number,
    lon: Number
  },
  userPhone: { type: String },
  radiusKm: { type: Number, default: 15 },
  donorsAlerted: [{ donorId: mongoose.Schema.Types.ObjectId, phone: String, status: String }],
  donorsResponded: [{ donorId: mongoose.Schema.Types.ObjectId, response: String, timestamp: Date }],
  hospitalNotified: [{ hospitalId: mongoose.Schema.Types.ObjectId }],
  status: { type: String, enum: ['pending', 'resolved', 'expired'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SOSRequest', sosRequestSchema);