const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const auth = require('../middleware/auth');
 
// Inscription client
router.post('/inscription', async (req, res) => {
  try {
    const { nom, prenom, telephone, email, motDePasse } = req.body;
    const existant = await User.findOne({ telephone });
    if (existant) return res.status(400).json({ message: 'Ce numéro existe déjà' });
    const hash = await bcrypt.hash(motDePasse, 10);
    const user = new User({ nom, prenom, telephone, email, motDePasse: hash });
    await user.save();
    const qrData = `https://biosaveur-app-production.up.railway.app/qr.html?id=${user._id}`;
    const qrCode = await QRCode.toDataURL(qrData);
    user.qrCode = qrCode;
    await user.save();
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ message: 'Inscription réussie', token, user: { nom, prenom, telephone, qrCode } });
  } catch (err) {
    console.log('ERREUR INSCRIPTION:', err.message);
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// Connexion
router.post('/connexion', async (req, res) => {
  try {
    const { telephone, motDePasse } = req.body;
    const user = await User.findOne({ telephone });
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    const valide = await user.verifierMotDePasse(motDePasse);
    if (!valide) return res.status(401).json({ message: 'Mot de passe incorrect' });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Connexion réussie', token, user: { nom: user.nom, prenom: user.prenom, role: user.role, qrCode: user.qrCode } });
  } catch (err) {
    console.log('ERREUR CONNEXION:', err.message);
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// Changer mot de passe
router.put('/changer-mdp', auth, async (req, res) => {
  try {
    const { ancienMdp, nouveauMdp } = req.body;
    const user = await User.findById(req.user.id);
    const valide = await user.verifierMotDePasse(ancienMdp);
    if (!valide) return res.status(401).json({ message: 'Ancien mot de passe incorrect' });
    user.motDePasse = await bcrypt.hash(nouveauMdp, 10);
    await user.save();
    res.json({ message: 'Mot de passe modifié avec succès' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});
 
// Choisir jour de livraison
router.put('/jour-livraison', auth, async (req, res) => {
  try {
    const { jourLivraison } = req.body;
    await User.findByIdAndUpdate(req.user.id, { jourLivraison });
    res.json({ message: 'Jour de livraison mis à jour' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});// Profil du client connecté
router.get('/profil', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-motDePasse');
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});// Connexion via QR code
router.get('/qr/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-motDePasse');
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    if (user.role !== 'client') return res.status(403).json({ message: 'Accès refusé' });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: { nom: user.nom, prenom: user.prenom, role: user.role, qrCode: user.qrCode } });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});
 
module.exports = router;