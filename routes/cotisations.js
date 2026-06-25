const express = require('express');
const router = express.Router();
const Cotisation = require('../models/Cotisation');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { envoyerSMS } = require('../services/sms');
 
// Créer une cotisation
router.post('/', auth, async (req, res) => {
  try {
    const { clientId, objectifPoulets, prixUnitaire, mois, jourLivraisonChoisi } = req.body;
    const montantObjectif = objectifPoulets * (prixUnitaire || 2800);
    const cotisation = new Cotisation({
      client: clientId,
      objectifPoulets,
      prixUnitaire: prixUnitaire || 2800,
      montantObjectif,
      mois,
      jourLivraisonChoisi
    });
    await cotisation.save();
    try {
      const client = await User.findById(clientId);
      if (client && client.telephone) {
        await envoyerSMS('+225' + client.telephone,
          `Bonjour ${client.prenom}, votre cotisation BIOSAVEUR de ${objectifPoulets} poulets a été créée. Montant: ${montantObjectif} FCFA.`);
      }
    } catch (smsErr) { console.error('SMS err:', smsErr.message); }
    res.status(201).json({ message: 'Cotisation créée', cotisation });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// Toutes les cotisations (admin)
router.get('/', auth, async (req, res) => {
  try {
    const cotisations = await Cotisation.find()
      .populate('client', 'nom prenom telephone jourLivraison')
      .sort({ dateCreation: -1 });
    res.json(cotisations);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// Ajouter un versement
router.post('/:id/versement', auth, async (req, res) => {
  try {
    const { montant, modePaiement, reference } = req.body;
    const cotisation = await Cotisation.findById(req.params.id);
    if (!cotisation) return res.status(404).json({ message: 'Cotisation non trouvée' });
    cotisation.versements.push({ montant, modePaiement, reference, date: new Date() });
    cotisation.montantCollecte += montant;
    if (cotisation.montantCollecte >= cotisation.montantObjectif) cotisation.statut = 'complete';
    await cotisation.save();
    try {
      await cotisation.populate('client', 'nom prenom telephone');
      const cl = cotisation.client;
      if (cl && cl.telephone) {
        await envoyerSMS('+225' + cl.telephone,
          `Bonjour ${cl.prenom}, versement de ${montant} FCFA enregistré. Total: ${cotisation.montantCollecte}/${cotisation.montantObjectif} FCFA.`);
      }
    } catch (smsErr) { console.error('SMS versement err:', smsErr.message); }
    res.json({ message: 'Versement enregistré', cotisation });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// Confirmer livraison + archivage automatique + nouvelle cotisation
router.put('/:id/livrer', auth, async (req, res) => {
  try {
    const cotisationActuelle = await Cotisation.findById(req.params.id);
    if (!cotisationActuelle) {
      return res.status(404).json({ message: 'Cotisation non trouvée' });
    }
    if (cotisationActuelle.statut === 'livre') {
      return res.status(400).json({ message: 'Cette cotisation est déjà livrée' });
    }

    cotisationActuelle.statut = 'livre';
    cotisationActuelle.dateLivraisonEffective = new Date();
    await cotisationActuelle.save();

    const moisActuel = new Date(cotisationActuelle.mois || Date.now());
    const moisSuivant = new Date(moisActuel);
    moisSuivant.setMonth(moisSuivant.getMonth() + 1);

    const nouvelleCotisation = new Cotisation({
      client: cotisationActuelle.client,
      mois: moisSuivant,
      objectifPoulets: cotisationActuelle.objectifPoulets,
      prixUnitaire: cotisationActuelle.prixUnitaire,
      montantObjectif: cotisationActuelle.montantObjectif,
      montantCollecte: 0,
      versements: [],
      statut: 'en_cours',
      jourLivraisonChoisi: cotisationActuelle.jourLivraisonChoisi,
      encaisse: false,
      cotisationPrecedenteId: cotisationActuelle._id
    });
    await nouvelleCotisation.save();

    res.json({
      message: 'Livraison confirmée, nouvelle cotisation créée',
      cotisationLivree: cotisationActuelle,
      nouvelleCotisation
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// Mettre à jour le jour de livraison
router.put('/:id/jour-livraison', auth, async (req, res) => {
  try {
    const { jourLivraisonChoisi } = req.body;
    const cotisation = await Cotisation.findByIdAndUpdate(
      req.params.id,
      { jourLivraisonChoisi },
      { new: true }
    );
    res.json({ message: 'Jour de livraison mis à jour', cotisation });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// Supprimer une cotisation
router.delete('/:id', auth, async (req, res) => {
  try {
    await Cotisation.findByIdAndDelete(req.params.id);
    res.json({ message: 'Cotisation supprimée' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// Cotisations du client connecté
router.get('/mes-cotisations', auth, async (req, res) => {
  try {
    const cotisations = await Cotisation.find({ client: req.user.id });
    res.json(cotisations);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 // Basculer le statut encaissé
router.patch('/:id/encaisse', auth, async (req, res) => {
  try {
    const cotisation = await Cotisation.findById(req.params.id);
    if (!cotisation) {
      return res.status(404).json({ message: 'Cotisation non trouvée' });
    }
    cotisation.encaisse = !cotisation.encaisse;
    await cotisation.save();
    res.json({ message: 'Statut encaissé mis à jour', encaisse: cotisation.encaisse, cotisation });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
module.exports = router;
