const mongoose = require('mongoose');

const whatsAppSessionSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    data: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false, collection: 'whatsapp_sessions' }
);

module.exports = mongoose.model('WhatsAppSession', whatsAppSessionSchema);
