const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['versement', 'cotisation', 'livraison', 'message', 'relance'], default: 'versement' },
  lu: { type: Boolean, default: false },
  lien: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
