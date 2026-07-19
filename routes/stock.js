const express = require('express');
const router = express.Router();
const Stock = require('../models/Stock');
const Cotisation = require('../models/Cotisation');
const auth = require('../middleware/auth');

// Liste tout le stock
router.get('/', auth, async (req, res) => {
  try {
    const stock = await Stock.find().sort({ createdAt: -1 });
    res.json(stock);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Ajouter une entrée de stock
router.post('/', auth, async (req, res) => {
  try {
    const { produit, quantiteDisponible, quantiteACommandee, dateArriveePrevu, fournisseur, telephoneFournisseur, notes } = req.body;
    if (!produit || !fournisseur) return res.status(400).json({ message: 'Produit et fournisseur sont obligatoires' });
    const entree = new Stock({ produit, quantiteDisponible, quantiteACommandee, dateArriveePrevu, fournisseur, telephoneFournisseur, notes });
    await entree.save();
    res.status(201).json({ message: 'Entrée de stock ajoutée', entree });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Modifier une entrée de stock
router.put('/:id', auth, async (req, res) => {
  try {
    const entree = await Stock.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ message: 'Stock mis à jour', entree });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Supprimer une entrée de stock
router.delete('/:id', auth, async (req, res) => {
  try {
    await Stock.findByIdAndDelete(req.params.id);
    res.json({ message: 'Entrée de stock supprimée' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Comparaison stock vs demande (cotisations en cours)
router.get('/comparaison', auth, async (req, res) => {
  try {
    const stock = await Stock.find();
    const cotisationsEnCours = await Cotisation.find({ statut: { $in: ['en_cours', 'complete'] } });

    const demandeParProduit = {};
    cotisationsEnCours.forEach(c => {
      (c.articles || []).forEach(a => {
        demandeParProduit[a.produit] = (demandeParProduit[a.produit] || 0) + a.quantite;
      });
    });

    const comparaison = Object.entries(demandeParProduit).map(([produit, demande]) => {
      const stockCorrespondant = stock.filter(s => s.produit === produit);
      const disponible = stockCorrespondant.reduce((s, e) => s + (e.quantiteDisponible || 0), 0);
      const enCommande = stockCorrespondant.reduce((s, e) => s + (e.quantiteACommandee || 0), 0);
      return {
        produit,
        demande,
        disponible,
        enCommande,
        statut: (disponible + enCommande) >= demande ? 'ok' : 'alerte'
      };
    });

    res.json(comparaison);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

module.exports = router;
