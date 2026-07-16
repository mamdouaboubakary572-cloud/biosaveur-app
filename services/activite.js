const Activite = require('../models/Activite');

async function logActivite(req, action, details) {
  try {
    await Activite.create({
      adminId: req.user?.id,
      adminNom: req.user?.nom || 'Admin',
      action,
      details
    });
  } catch (err) {
    console.error('Erreur log activité:', err.message);
  }
}

module.exports = { logActivite };
