const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const Commande = require('../models/Commande');
const auth = require('../middleware/auth');

// Créer une commande
router.post('/', auth, async (req, res) => {
  try {
    const { produits, adresseLivraison, tracabilite } = req.body;
    
    const montantTotal = produits.reduce((total, p) => total + (p.quantite * p.prixUnitaire), 0);
    
    const commande = new Commande({
      client: req.user.id,
      produits,
      montantTotal,
      adresseLivraison,
      tracabilite
    });

    await commande.save();

    // Génération QR Code livraison
    const qrData = JSON.stringify({
      commandeId: commande._id,
      client: req.user.id,
      montant: montantTotal,
      adresse: adresseLivraison,
      halal: true,
      origine: 'BIOSAVEUR'
    });
    const qrCode = await QRCode.toDataURL(qrData);
    commande.qrCodeLivraison = qrCode;
    await commande.save();

    res.status(201).json({ message: 'Commande créée', commande });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Mes commandes (client)
router.get('/mes-commandes', auth, async (req, res) => {
  try {
    const commandes = await Commande.find({ client: req.user.id }).sort({ dateCreation: -1 });
    res.json(commandes);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Toutes les commandes (admin)
router.get('/toutes', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Accès refusé' });
    const commandes = await Commande.find().populate('client', 'nom prenom telephone').sort({ dateCreation: -1 });
    res.json(commandes);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Mettre à jour le statut (livreur/admin)
router.put('/:id/statut', auth, async (req, res) => {
  try {
    const { statut } = req.body;
    const commande = await Commande.findByIdAndUpdate(
      req.params.id,
      { statut },
      { new: true }
    );
    res.json({ message: 'Statut mis à jour', commande });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

module.exports = router;