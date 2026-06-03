const express = require('express');
const router = express.Router();
const Cotisation = require('../models/Cotisation');
const auth = require('../middleware/auth');

// Admin: créer cotisation pour un client
router.post('/', auth, async (req, res) => {
  try {
    const { clientId, objectifPoulets, prixUnitaire, mois, jourLivraisonChoisi } = req.body;
    const montantObjectif = objectifPoulets * (prixUnitaire || 2800);
    const cotisation = new Cotisation({ client: clientId, objectifPoulets, prixUnitaire: prixUnitaire || 2800, montantObjectif, mois, jourLivraisonChoisi });
    await cotisation.save();
    res.status(201).json({ message: 'Cotisation créée', cotisation });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Admin: ajouter un versement
router.post('/:id/versement', auth, async (req, res) => {
  try {
    const { montant, modePaiement, reference } = req.body;
    const cotisation = await Cotisation.findById(req.params.id);
    cotisation.versements.push({ montant, modePaiement, reference, date: new Date() });
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
    const cotisations = await Cotisation.find().populate('client', 'nom prenom telephone jourLivraison');
    res.json(cotisations);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Admin: marquer comme livré
router.put('/:id/livrer', auth, async (req, res) => {
  try {
    const cotisation = await Cotisation.findByIdAndUpdate(req.params.id, { statut: 'livre', dateLivraisonEffective: new Date() }, { new: true });
    res.json({ message: 'Livraison confirmée', cotisation });
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

// Client: choisir jour de livraison
router.put('/:id/jour-livraison', auth, async (req, res) => {
  try {
    const { jourLivraisonChoisi } = req.body;
    const cotisation = await Cotisation.findByIdAndUpdate(req.params.id, { jourLivraisonChoisi }, { new: true });
    res.json({ message: 'Jour de livraison mis à jour', cotisation });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
