const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
  },
  contactPhone: { type: String, required: true },
  adminUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Profile signals for demand forecasting (a maternity/trauma ward, size, and
  // catchment population all shift expected blood demand). Optional; sensible
  // defaults let the model run before an admin fills them in.
  profile: {
    hasMaternity: { type: Boolean, default: false },
    hasTrauma: { type: Boolean, default: false },
    hasPediatric: { type: Boolean, default: false },
    bedCount: { type: Number, default: 200 },
    catchmentK: { type: Number, default: 200 },
  },
  createdAt: { type: Date, default: Date.now },
  deliveryStatus: { type: String, enum: ['pending', 'in-transit', 'delivered'], default: 'delivered' }
});

hospitalSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Hospital', hospitalSchema);