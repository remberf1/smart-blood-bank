const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
  resourceType: { type: String, enum: ['blood', 'oxygen'], required: true },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  units: { type: Number, default: 0 },
  oxygenCylinderCount: { type: Number, default: 0 },
  oxygenFillStatus: { type: String, enum: ['full', 'partial', 'empty'], default: 'empty' },
  lastUpdatedAt: { type: Date, default: Date.now },
  expiryAlerts: [{ bloodUnitId: String, expiryDate: Date }]
});

module.exports = mongoose.model('Inventory', inventorySchema);