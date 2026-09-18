const mongoose = require('mongoose');

const patientRequestSchema = new mongoose.Schema({
  patientName: { type: String },
  contactPhone: { type: String, required: true },
  email: { type: String }, // optional — for email status updates
  resourceType: { type: String, enum: ['blood', 'oxygen'], required: true },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  componentType: {
    type: String,
    enum: ['WHOLE_BLOOD', 'PACKED_RED_CELLS', 'PLATELET_CONCENTRATE', 'FRESH_FROZEN_PLASMA', 'CRYOPRECIPITATE'],
    default: 'PACKED_RED_CELLS',
  },
  requiresThawing: { type: Boolean, default: false },
  crossmatchRequired: { type: Boolean, default: true },
  units: { type: Number, required: true, default: 1 },
  urgency: { type: String, enum: ['emergency', 'scheduled', 'routine'], default: 'routine' },
  preferredHospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  referenceId: { type: String, trim: true }, // e.g., "SBB-4A7F2"
  doctorName: { type: String, trim: true },
  doctorPhone: { type: String, trim: true },
  clinicalIndication: { type: String, trim: true },

  // --- Fields for advance scheduling and delivery tracking ---
  scheduledTime: { type: Date },                     // when the patient needs the resource (e.g., next week 4pm)
  destinationFacility: { type: String },            // target hospital, clinic, or health centre
  ward: { type: String },                           // hospital ward or department (e.g., Ward 4, Emergency)
  bedNumber: { type: String },                      // bed or room number
  deliveryStatus: {
    type: String,
    enum: ['pending', 'approved', 'in-transit', 'delivered', 'cancelled'],
    default: 'pending'
  },
  cancellationReason: { type: String },
  cancelledAt: { type: Date },
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