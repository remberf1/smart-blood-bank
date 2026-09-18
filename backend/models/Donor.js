const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const donorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, lowercase: true, trim: true },
  bloodGroup: {
    type: String,
    enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    required: true,
  },
  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true },
  },
  dateOfBirth: { type: Date }, // optional — WhatsApp quick-reg omits it; staff verify age at donation
  gender: { type: String, enum: ["Male", "Female", "Other"] },
  // No hard min here: registration logic defers under-threshold donors
  // instead of rejecting them outright (see routes/donors.js eligibility rules).
  weight: { type: Number },
  lastDonationDate: { type: Date },
  eligibilityStatus: {
    type: String,
    enum: ["eligible", "deferred", "pending", "ineligible"],
    default: "pending",
  },
  deferralReason: { type: String },
  qrCode: { type: String },
  // Informational "home" hospital — the one that registered them or took their
  // first donation. Donors remain a shared pool (visible to all staff, alertable
  // by SOS regardless of hospital); this is a tag, not an access boundary.
  homeHospitalId: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital" },
  allergies: { type: String, default: '' },
  nin: { type: String, trim: true, select: false },
  ninMasked: { type: String, trim: true },
  notes: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  sosOptIn: { type: Boolean, default: true },
  sosAlertCount: { type: Number, default: 0 },
  lastSosAlert: { type: Date },
  password: { type: String, select: false },
  resetTokenHash: { type: String, select: false },
  resetTokenExpiry: { type: Date, select: false },
  authProvider: {
    type: String,
    enum: ["local", "google", "facebook"],
    default: "local",
  },
  emailVerified: { type: Boolean, default: false },
});

donorSchema.index({ location: "2dsphere" });

// Async/await pre-save hook – no 'next' parameter
donorSchema.pre("save", async function () {
  // Update timestamp
  this.updatedAt = Date.now();

  // Auto-mask NIN if provided
  if (this.isModified("nin") && this.nin) {
    const cleanNin = this.nin.replace(/\D/g, '');
    this.ninMasked = cleanNin.length >= 4 ? '*******' + cleanNin.slice(-4) : cleanNin;
  }
  
  // Hash password if modified
  if (this.isModified("password") && this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
});

module.exports = mongoose.model("Donor", donorSchema);