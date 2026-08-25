const mongoose = require('mongoose');

const patientRequestSchema = new mongoose.Schema({
  patientName: { type: String },
  contactPhone: { type: String, required: true },
  resourceType: { type: String, enum: ['blood', 'oxygen'], required: true },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  units: { type: Number, required: true, default: 1 },
  urgency: { type: String, enum: ['emergency', 'scheduled', 'routine'], default: 'routine' },
  preferredHospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },

  // --- New fields for advance scheduling and delivery tracking ---
  scheduledTime: { type: Date },                     // when the patient needs the resource (e.g., next week 4pm)
  deliveryStatus: {
    type: String,
    enum: ['pending', 'approved', 'in-transit', 'delivered', 'cancelled'],
    default: 'pending'
  },
  approvedAt: { type: Date },
  inTransitAt: { type: Date },
  deliveredAt: { type: Date },
  // --------------------------------------------------------------

  allocatedBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'BloodBatch' },
  allocatedHospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' }, // hospital matched to fulfill this request
  // Which batches (and thus donors) actually fulfilled this request — the
  // donor -> unit -> patient traceability chain, recorded on delivery.
  fulfilledBatches: [{
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'BloodBatch' },
    donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donor' },
    bloodGroup: { type: String }, // actual donor group used (may differ from request when compatible)
    units: { type: Number },
  }],
  notes: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PatientRequest', patientRequestSchema);