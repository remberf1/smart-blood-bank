const mongoose = require('mongoose');

const donorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String },
  bloodGroup: { 
    type: String, 
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], 
    required: true 
  },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
  },
  dateOfBirth: { type: Date, required: true },
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  weight: { type: Number, min: 50 }, // minimum weight requirement (kg)
  lastDonationDate: { type: Date },
  eligibilityStatus: { 
    type: String, 
    enum: ['eligible', 'deferred', 'pending', 'ineligible'], 
    default: 'pending' 
  },
  deferralReason: { type: String },
  qrCode: { type: String }, // will store base64 or URL of QR code
  notes: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  sosOptIn: { type: Boolean, default: true }, 
sosAlertCount: { type: Number, default: 0 }, 
lastSosAlert: { type: Date } 
});

// Create geospatial index for location-based queries (for SOS)
donorSchema.index({ location: '2dsphere' });

// // Update updatedAt on save
donorSchema.pre('save', async function() {
  this.updatedAt = Date.now();
});

module.exports = mongoose.model('Donor', donorSchema);