const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// Liste tous les clients
router.get('/clients', auth, async (req, res) => {
  try {
    const clients = await User.find().select('-motDePasse').sort({ dateCreation: -1 });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

module.exports = router;