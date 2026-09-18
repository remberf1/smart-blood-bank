const mongoose = require('mongoose');

// Immutable record of a significant action, for superadmin accountability.
const auditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorEmail: { type: String },
  actorRole: { type: String },
  action: { type: String, required: true }, // e.g. 'user.create', 'donation.record'
  entity: { type: String },                 // e.g. 'User', 'Donor', 'ResourceRequest'
  entityId: { type: String },
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  summary: { type: String },                // human-readable one-liner
  meta: { type: Object },
  createdAt: { type: Date, default: Date.now },
});

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

// Strictly prevent any update or delete operations on audit logs (NDPA & ISO 27001 compliance)
const blockMutation = function () {
  throw new Error('AuditLog records are strictly immutable and cannot be modified or deleted.');
};

auditLogSchema.pre('updateOne', blockMutation);
auditLogSchema.pre('updateMany', blockMutation);
auditLogSchema.pre('findOneAndUpdate', blockMutation);
auditLogSchema.pre('deleteOne', blockMutation);
auditLogSchema.pre('deleteMany', blockMutation);
auditLogSchema.pre('findOneAndDelete', blockMutation);

module.exports = mongoose.model('AuditLog', auditLogSchema);
