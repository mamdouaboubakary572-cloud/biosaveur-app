const mongoose = require('mongoose');
const activiteSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  adminNom: String,
  action: String,
  details: String,
  date: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Activite', activiteSchema);
