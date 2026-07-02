const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const auth = require('../middleware/auth');
const Notification = require('../models/Notification');

// Client: envoyer un message
router.post('/', auth, async (req, res) => {
  try {
    const message = new Message({ client: req.user.id, contenu: req.body.contenu });
    await message.save();
    res.status(201).json({ message: 'Message envoyé', data: message });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Client: ses messages
router.get('/mes-messages', auth, async (req, res) => {
  try {
    const messages = await Message.find({ client: req.user.id }).sort({ dateEnvoi: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Admin: tous les messages
router.get('/', auth, async (req, res) => {
  try {
    const messages = await Message.find().populate('client', 'nom prenom telephone').sort({ dateEnvoi: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Admin: répondre à un message
router.put('/:id/repondre', auth, async (req, res) => {
  try {
    const message = await Message.findByIdAndUpdate(req.params.id, { reponse: req.body.reponse, lu: true, dateReponse: new Date() }, { new: true });
    try {
      await Notification.create({
        userId: message.client,
        message: `BIOSAVEUR a repondu a votre message : "${req.body.reponse}"`,
        type: 'message'
      });
    } catch (notifErr) { console.error('Erreur notification message:', notifErr.message); }
    res.json({ message: 'Reponse envoyee', data: message });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Admin: marquer comme lu
router.put('/:id/lu', auth, async (req, res) => {
  try {
    const message = await Message.findByIdAndUpdate(req.params.id, { lu: true }, { new: true });
    res.json(message);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
