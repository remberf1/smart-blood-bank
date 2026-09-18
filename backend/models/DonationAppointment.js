const mongoose = require('mongoose');

const donationAppointmentSchema = new mongoose.Schema({
  donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donor', required: true },
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
  appointmentDate: { type: Date, required: true },
  preferredDay: { type: String }, // e.g. "Friday, 19 Sep 2026"
  preferredWindow: {
    type: String,
    enum: ['morning', 'afternoon', 'flexible'],
    default: 'morning',
  },
  donorNinMasked: { type: String },
  // 'pending' = donor offered a day, awaiting hospital confirmation
  // 'scheduled' = confirmed by the hospital, then completed/missed/cancelled
  status: {
    type: String,
    enum: ['pending', 'scheduled', 'completed', 'cancelled', 'missed'],
    default: 'pending',
  },
  notes: { type: String },
  reminderSent: { type: Boolean, default: false }, // set once a reminder WhatsApp goes out
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('DonationAppointment', donationAppointmentSchema);