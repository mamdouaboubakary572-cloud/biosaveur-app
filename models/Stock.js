const mongoose = require('mongoose');
const stockSchema = new mongoose.Schema({
  produit: { type: String, required: true },
  quantiteDisponible: { type: Number, default: 0 },
  quantiteACommandee: { type: Number, default: 0 },
  dateArriveePrevu: { type: Date },
  fournisseur: { type: String, required: true },
  telephoneFournisseur: { type: String, default: '' },
  notes: { type: String, default: '' }
}, { timestamps: true });
module.exports = mongoose.model('Stock', stockSchema);
