const mongoose = require('mongoose');

const donationAppointmentSchema = new mongoose.Schema({
  donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donor', required: true },
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
  appointmentDate: { type: Date, default: Date.now },
  assignedDate: { type: Date }, // Confirmed appointment date set by hospital admin
  assignedTime: { type: String }, // e.g. "10:00 AM" set by hospital admin
  timeSlot: { type: String }, // e.g. "10:00 - 10:45 AM"
  preferredDay: { type: String }, // e.g. "Friday, 19 Sep 2026" or "Any day"
  preferredWindow: {
    type: String,
    enum: ['morning', 'afternoon', 'flexible'],
    default: 'morning',
  },
  donorNinMasked: { type: String },
  // 'pending' = donor offered to donate, awaiting hospital confirmation and time assignment
  // 'scheduled' = confirmed with date & time by the hospital admin
  status: {
    type: String,
    enum: ['pending', 'scheduled', 'completed', 'cancelled', 'missed'],
    default: 'pending',
  },
  confirmedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  confirmedAt: { type: Date },
  notes: { type: String },
  reminderSent: { type: Boolean, default: false }, // set once a reminder WhatsApp goes out
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

donationAppointmentSchema.index({ hospitalId: 1, appointmentDate: 1, status: 1 });

module.exports = mongoose.model('DonationAppointment', donationAppointmentSchema);