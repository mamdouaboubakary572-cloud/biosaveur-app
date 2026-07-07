const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const auth = require('../middleware/auth');
 
// ─── CLIENTS ───────────────────────────────────────────
 
// Liste tous les clients
router.get('/clients', auth, async (req, res) => {
  try {
    const clients = await User.find({ role: 'client' })
      .select('-motDePasse')
      .populate('parrainId', 'nom prenom')
      .sort({ dateCreation: -1 });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// Supprimer un client
router.delete('/clients/:id', auth, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Client supprimé avec succès' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// ─── ADMINS ────────────────────────────────────────────
 
// Liste tous les admins
router.get('/admins', auth, async (req, res) => {
  try {
    const admins = await User.find({ role: { $in: ['admin', 'superviseur', 'livreur'] } })
      .select('-motDePasse').sort({ dateCreation: -1 });
    res.json(admins);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// Créer un admin
router.post('/admins', auth, async (req, res) => {
  try {
    const { nom, prenom, telephone, motDePasse, role } = req.body;
    if (!nom || !prenom || !telephone || !motDePasse) {
      return res.status(400).json({ message: 'Tous les champs sont obligatoires' });
    }
    const existant = await User.findOne({ telephone });
    if (existant) return res.status(400).json({ message: 'Ce numéro existe déjà' });
    const hash = await bcrypt.hash(motDePasse, 10);
    const admin = new User({ nom, prenom, telephone, motDePasse: hash, role: role || 'superviseur' });
    await admin.save();
    res.status(201).json({ message: 'Administrateur créé', admin: { nom, prenom, telephone, role: admin.role } });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// Supprimer un admin
router.delete('/admins/:id', auth, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Administrateur supprimé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

 // Réinitialiser le mot de passe d'un client
router.put('/clients/:id/reinitialiser-mdp', auth, async (req, res) => {
  try {
    const { nouveauMotDePasse } = req.body;
    if (!nouveauMotDePasse || nouveauMotDePasse.length < 4) {
      return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 4 caractères' });
    }
    const hash = await bcrypt.hash(nouveauMotDePasse, 10);
    const user = await User.findByIdAndUpdate(req.params.id, { motDePasse: hash }, { new: true });
    if (!user) return res.status(404).json({ message: 'Client non trouvé' });
    res.json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
module.exports = router;
 
