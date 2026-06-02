const mongoose = require('mongoose');

const commandeSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  produits: [{
    nom: { type: String, required: true },
    quantite: { type: Number, required: true },
    poids: { type: Number },
    prixUnitaire: { type: Number, required: true }
  }],
  montantTotal: { type: Number, required: true },
  statut: { 
    type: String, 
    enum: ['en_attente', 'confirmee', 'en_livraison', 'livree', 'annulee'], 
    default: 'en_attente' 
  },
  adresseLivraison: { type: String, required: true },
  qrCodeLivraison: { type: String },
  livreur: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dateLivraison: { type: Date },
  tracabilite: {
    dateAbattage: { type: Date },
    poids: { type: Number },
    halal: { type: Boolean, default: true },
    origine: { type: String, default: 'ANAM-CI' }
  },
  dateCreation: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Commande', commandeSchema);