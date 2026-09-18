const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
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
  processingFeeDisclosure: {
    type: String,
    default: 'Standard clinical processing fee: ₦8,000–₦15,000 per unit under National Blood Policy (screening, grouping, cross-matching, storage). Blood itself is donated voluntarily and cannot be sold under Section 53 of the National Health Act 2014.',
  },
  dailyDonationCapacity: { type: Number, default: 10 }, // Maximum donors phlebotomy team can handle per day
  hourlyDonationCapacity: { type: Number, default: 2 }, // Maximum donors per hour / time slot
  createdAt: { type: Date, default: Date.now }
});

hospitalSchema.index({ location: '2dsphere' });

/**
 * Geospatial hospital finder using MongoDB $geoNear (2dsphere index).
 * Returns hospitals sorted strictly by spherical distance on Earth.
 */
hospitalSchema.statics.findNearest = async function (longitude, latitude, limit = 5, maxDistanceMeters = 100000) {
  try {
    return await this.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)] },
          distanceField: 'distanceMeters',
          maxDistance: maxDistanceMeters,
          spherical: true,
        },
      },
      {
        $project: {
          name: 1,
          address: 1,
          contactPhone: 1,
          location: 1,
          distanceKm: { $round: [{ $divide: ['$distanceMeters', 1000] }, 1] },
        },
      },
      { $limit: limit },
    ]);
  } catch (err) {
    // Graceful fallback to in-memory haversine if 2dsphere index is warming up
    const all = await this.find().lean();
    const { haversineDistance } = require('../controllers/wpsEngine');
    return all.map((h) => {
      let dist = null;
      if (h.location?.coordinates?.length >= 2) {
        dist = haversineDistance(latitude, longitude, h.location.coordinates[1], h.location.coordinates[0]);
      }
      return {
        ...h,
        distanceKm: dist != null ? parseFloat(dist.toFixed(1)) : null,
      };
    }).sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999)).slice(0, limit);
  }
};

module.exports = mongoose.model('Hospital', hospitalSchema);