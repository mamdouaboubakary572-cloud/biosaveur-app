const express = require('express');
const router = express.Router();
const axios = require('axios');
const auth = require('../middleware/auth');
const Cotisation = require('../models/Cotisation');
const Notification = require('../models/Notification');

// Initier un paiement pour une cotisation
router.post('/initier/:cotisationId', auth, async (req, res) => {
  try {
    const cotisation = await Cotisation.findById(req.params.cotisationId).populate('client', 'nom prenom telephone');
    if (!cotisation) return res.status(404).json({ message: 'Cotisation non trouvée' });

    const reste = (cotisation.montantObjectif || 0) - (cotisation.montantCollecte || 0);
    if (reste <= 0) return res.status(400).json({ message: 'Cette cotisation est déjà soldée' });

    const transactionId = 'BSV-' + cotisation._id.toString().slice(-8) + '-' + Date.now();

    const response = await axios.post('https://api-checkout.cinetpay.com/v2/payment', {
      apikey: process.env.CINETPAY_APIKEY,
      site_id: process.env.CINETPAY_SITE_ID,
      transaction_id: transactionId,
      amount: reste,
      currency: 'XOF',
      description: 'Cotisation BIOSAVEUR ' + cotisation.mois,
      customer_name: cotisation.client?.nom || 'Client',
      customer_surname: cotisation.client?.prenom || '',
      customer_phone_number: '+225' + (cotisation.client?.telephone || ''),
      notify_url: process.env.APP_URL + '/api/cinetpay/notify',
      return_url: process.env.APP_URL + '/client.html',
      channels: 'ALL',
      metadata: cotisation._id.toString()
    });

    if (response.data.code === '201') {
      res.json({ paymentUrl: response.data.data.payment_url });
    } else {
      res.status(400).json({ message: 'Erreur CinetPay', detail: response.data.message });
    }
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Webhook — CinetPay confirme le paiement ici
router.post('/notify', async (req, res) => {
  try {
    const transactionId = req.body.cpm_trans_id;
    if (!transactionId) return res.status(400).send('Requête invalide');

    // Vérification auprès de CinetPay (ne jamais faire confiance à la simple notification)
    const verif = await axios.post('https://api-checkout.cinetpay.com/v2/payment/check', {
      apikey: process.env.CINETPAY_APIKEY,
      site_id: process.env.CINETPAY_SITE_ID,
      transaction_id: transactionId
    });

    const data = verif.data.data;
    if (verif.data.code === '00' && data.status === 'ACCEPTED') {
      const cotisationId = data.metadata;
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
          message: `Paiement de ${data.amount} FCFA confirmé automatiquement via ${data.payment_method}.`,
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
