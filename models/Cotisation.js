const mongoose = require('mongoose');
const versementSchema = new mongoose.Schema({
  montant: Number,
  date: { type: Date, default: Date.now },
  modePaiement: { type: String, default: 'Wave' },
  reference: { type: String, default: '' }
});
const cotisationSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mois: { type: String, required: true },
  objectifPoulets: { type: Number, required: true },
  prixUnitaire: { type: Number, default: 2800 },
  montantObjectif: Number,
  montantCollecte: { type: Number, default: 0 },
  versements: [versementSchema],
  statut: { type: String, enum: ['en_cours', 'complete', 'livre'], default: 'en_cours' },
  jourLivraisonChoisi: { type: String },
  dateLivraisonEffective: { type: Date },
  encaisse: { type: Boolean, default: false },
  cotisationPrecedenteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cotisation' }
}, { timestamps: true });
module.exports = mongoose.model('Cotisation', cotisationSchema);
