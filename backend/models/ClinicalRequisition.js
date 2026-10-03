const mongoose = require('mongoose');

const clinicalRequisitionSchema = new mongoose.Schema({
  patientName: { type: String, trim: true },
  contactPhone: { type: String, required: true, trim: true },
  email: { type: String, trim: true }, // optional — for email status updates
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
  referenceId: { type: String, trim: true, index: true }, // e.g., "SBB-4A7F2"

  // --- Clinician Identity & Governance ---
  doctorRef: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    mdcnNumber: { type: String, trim: true },
    hospitalAffiliation: { type: String, trim: true },
    verificationStatus: {
      type: String,
      enum: ['verified_id', 'phone_only', 'unverified'],
      default: 'unverified',
    },
  },
  source: {
    type: String,
    enum: ['web_form', 'whatsapp_doctor', 'whatsapp_bridge', 'dashboard_requisition'],
    default: 'web_form',
  },

  // Legacy field support (kept in sync via pre-save)
  doctorName: { type: String, trim: true },
  doctorPhone: { type: String, trim: true },
  clinicalIndication: { type: String, trim: true },

  // --- Advance Scheduling & Logistics ---
  scheduledTime: { type: Date },
  destinationFacility: { type: String, trim: true },
  ward: { type: String, trim: true },
  bedNumber: { type: String, trim: true },
  deliveryStatus: {
    type: String,
    enum: ['pending', 'approved', 'in-transit', 'delivered', 'cancelled'],
    default: 'pending',
  },

  // --- Structured Cancellation & Consequence Tracking ---
  cancellation: {
    reason: {
      type: String,
      enum: [
        'patient_deceased',
        'patient_transferred',
        'no_longer_needed',
        'found_elsewhere',
        'stock_unavailable',
        'clinical_contraindication',
        'donor_unavailable',
        'timed_out',
        'other',
      ],
    },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledByRole: {
      type: String,
      enum: ['doctor', 'admin', 'staff', 'donor', 'system', 'patient'],
    },
    notes: { type: String, trim: true },
    cancelledAt: { type: Date },
  },
  consequences: {
    allocatedUnitsReleased: { type: Boolean, default: false },
    sosBroadcastStopped: { type: Boolean, default: false },
    familyNotified: { type: Boolean, default: false },
  },

  // Legacy cancellation compatibility
  cancellationReason: { type: String, trim: true },
  cancelledAt: { type: Date },
  approvedAt: { type: Date },
  inTransitAt: { type: Date },
  deliveredAt: { type: Date },

  // --- Fulfillment & Traceability ---
  allocatedBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'BloodBatch' },
  allocatedHospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  fulfilledBatches: [{
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'BloodBatch' },
    donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donor' },
    bloodGroup: { type: String },
    units: { type: Number },
  }],
  notes: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Bi-directional sync between doctorRef and legacy doctorName/doctorPhone
clinicalRequisitionSchema.pre('save', function () {
  if (!this.doctorRef) this.doctorRef = {};

  if (this.doctorName && !this.doctorRef.name) {
    this.doctorRef.name = this.doctorName;
  } else if (this.doctorRef.name && !this.doctorName) {
    this.doctorName = this.doctorRef.name;
  }

  if (this.doctorPhone && !this.doctorRef.phone) {
    this.doctorRef.phone = this.doctorPhone;
  } else if (this.doctorRef.phone && !this.doctorPhone) {
    this.doctorPhone = this.doctorRef.phone;
  }

  if (this.cancellation && this.cancellation.reason && !this.cancellationReason) {
    this.cancellationReason = this.cancellation.reason;
  } else if (this.cancellationReason && (!this.cancellation || !this.cancellation.reason)) {
    if (!this.cancellation) this.cancellation = {};
    this.cancellation.reason = this.cancellationReason;
  }

  if (this.cancellation && this.cancellation.cancelledAt && !this.cancelledAt) {
    this.cancelledAt = this.cancellation.cancelledAt;
  }

  this.updatedAt = new Date();
});

// Explicitly bind to existing 'patientrequests' collection to preserve all data
const ClinicalRequisition = mongoose.models.ClinicalRequisition || mongoose.model('ClinicalRequisition', clinicalRequisitionSchema, 'patientrequests');

module.exports = ClinicalRequisition;
