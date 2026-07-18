const express = require('express');
const router = express.Router();
const axios = require('axios');
const auth = require('../middleware/auth');
const Cotisation = require('../models/Cotisation');
const Notification = require('../models/Notification');

async function obtenirTokenCinetPay() {
  const res = await axios.post('https://api.cinetpay.net/v1/oauth/login', {
    api_key: process.env.CINETPAY_API_KEY,
    api_password: process.env.CINETPAY_API_PASSWORD
  });
  return res.data.access_token;
}

// Initier un paiement pour une cotisation
router.post('/initier/:cotisationId', auth, async (req, res) => {
  try {
    const cotisation = await Cotisation.findById(req.params.cotisationId).populate('client', 'nom prenom telephone');
    if (!cotisation) return res.status(404).json({ message: 'Cotisation non trouvée' });

    const reste = (cotisation.montantObjectif || 0) - (cotisation.montantCollecte || 0);
    if (reste <= 0) return res.status(400).json({ message: 'Cette cotisation est déjà soldée' });

    const token = await obtenirTokenCinetPay();
    // On encode l'ID de la cotisation directement dans le transaction_id pour le retrouver au webhook
    const transactionId = cotisation._id.toString() + '-' + Date.now();
    const emailClient = (cotisation.client?.telephone || 'client') + '@biosaveur-app.com';

    const response = await axios.post('https://api.cinetpay.net/v1/payment', {
      currency: 'XOF',
      merchant_transaction_id: transactionId,
      amount: reste,
      lang: 'fr',
      designation: 'Cotisation BIOSAVEUR ' + cotisation.mois,
      client_email: emailClient,
      client_first_name: cotisation.client?.prenom || 'Client',
      client_last_name: cotisation.client?.nom || '',
      client_phone_number: cotisation.client?.telephone || '',
      success_url: process.env.APP_URL + '/client.html',
      failed_url: process.env.APP_URL + '/client.html',
      notify_url: process.env.APP_URL + '/api/cinetpay/notify',
      channel: 'ALL',
      direct_pay: false
    }, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    res.json({ paymentUrl: response.data.payment_url || response.data.data?.payment_url });
  } catch (err) {
    console.error('Erreur CinetPay:', err.response?.data || err.message);
    res.status(500).json({ message: 'Erreur lors de l\'initialisation du paiement', erreur: err.response?.data || err.message });
  }
});

// Webhook — CinetPay confirme le paiement ici
router.post('/notify', async (req, res) => {
  try {
    const data = req.body;
    const transactionId = data.merchant_transaction_id || data.transaction_id;
    if (!transactionId) return res.status(400).send('Requête invalide');

    // On récupère l'ID de la cotisation à partir du transaction_id (format: {cotisationId}-{timestamp})
    const cotisationId = transactionId.split('-')[0];

    if (data.status === 'ACCEPTED' || data.status === 'success') {
      const cotisation = await Cotisation.findById(cotisationId);
      if (cotisation) {
        cotisation.versements.push({
          montant: parseInt(data.amount),
          modePaiement: data.payment_method || 'CinetPay',
          reference: transactionId,
          date: new Date()
        });
        cotisation.montantCollecte += parseInt(data.amount);
        if (cotisation.montantCollecte >= cotisation.montantObjectif) cotisation.statut = 'complete';
        await cotisation.save();

        await Notification.create({
          userId: cotisation.client,
          message: `Paiement de ${data.amount} FCFA confirmé automatiquement.`,
          type: 'versement'
        });
      }
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('Erreur webhook CinetPay:', err.message);
    res.status(500).send('Erreur');
  }
});

module.exports = router;
