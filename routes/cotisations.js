const express = require('express');
const router = express.Router();
const Cotisation = require('../models/Cotisation');
const auth = require('../middleware/auth');

// Admin: créer cotisation pour un client
router.post('/', auth, async (req, res) => {
  try {
    const { clientId, objectifPoulets, prixUnitaire, mois } = req.body;
    const montantObjectif = objectifPoulets * (prixUnitaire || 2800);
    const cotisation = new Cotisation({ client: clientId, objectifPoulets, prixUnitaire: prixUnitaire || 2800, montantObjectif, mois });
    await cotisation.save();
    res.status(201).json({ message: 'Cotisation créée', cotisation });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Admin: ajouter un versement
router.post('/:id/versement', auth, async (req, res) => {
  try {
    const { montant, modePaiement } = req.body;
    const cotisation = await Cotisation.findById(req.params.id);
    cotisation.versements.push({ montant, modePaiement });
    cotisation.montantCollecte += montant;
    if (cotisation.montantCollecte >= cotisation.montantObjectif) cotisation.statut = 'complete';
    await cotisation.save();
    res.json({ message: 'Versement enregistré', cotisation });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Admin: toutes les cotisations
router.get('/', auth, async (req, res) => {
  try {
    const cotisations = await Cotisation.find().populate('client', 'nom prenom telephone');
    res.json(cotisations);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Client: ses cotisations
router.get('/mes-cotisations', auth, async (req, res) => {
  try {
    const cotisations = await Cotisation.find({ client: req.user.id });
    res.json(cotisations);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
