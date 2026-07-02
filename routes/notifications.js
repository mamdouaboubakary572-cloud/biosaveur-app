const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Notification = require('../models/Notification');

// Récupérer les notifications du user connecté
router.get('/', auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20);
    const nonLues = await Notification.countDocuments({ userId: req.user.id, lu: false });
    res.json({ notifications, nonLues });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Marquer toutes les notifications comme lues
router.put('/lire-tout', auth, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.id, lu: false }, { lu: true });
    res.json({ message: 'Toutes les notifications marquées comme lues' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Marquer une notification comme lue
router.put('/:id/lire', auth, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { lu: true });
    res.json({ message: 'Notification marquée comme lue' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

module.exports = router;
