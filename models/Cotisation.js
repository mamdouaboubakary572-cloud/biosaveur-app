const mongoose = require('mongoose');
const versementSchema = new mongoose.Schema({
  montant: Number,
  date: { type: Date, default: Date.now },
  modePaiement: { type: String, default: 'Wave' },
  reference: { type: String, default: '' }
});
const articleSchema = new mongoose.Schema({
  produit: { type: String, required: true },
  quantite: { type: Number, required: true },
  prixUnitaire: { type: Number, required: true },
  sousTotal: { type: Number, required: true }
});
const cotisationSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mois: { type: String, required: true },
  articles: [articleSchema],
  objectifPoulets: { type: Number },
  prixUnitaire: { type: Number },
  montantObjectif: Number,
  montantCollecte: { type: Number, default: 0 },
  versements: [versementSchema],
  statut: { type: String, enum: ['en_cours', 'complete', 'livre'], default: 'en_cours' },
  jourLivraisonChoisi: { type: String },
  dateLivraisonEffective: { type: Date },
 encaisse: { type: Boolean, default: false },
  cotisationPrecedenteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cotisation' },
  note: { type: Number, min: 1, max: 5 },
  commentaireAvis: { type: String, default: '' }
}, { timestamps: true });
module.exports = mongoose.model('Cotisation', cotisationSchema);
