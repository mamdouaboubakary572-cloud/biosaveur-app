const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// Connexion MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  tlsAllowInvalidCertificates: true,
  tls: true,
  serverSelectionTimeoutMS: 5000
})
  .then(() => console.log('MongoDB connecté'))
  .catch(err => console.log('Erreur MongoDB:', err));
// SMS automatique hebdomadaire - rappel objectif cotisation
const Cotisation = require('./models/Cotisation');
const { envoyerSMS } = require('./services/sms');

async function envoyerRappelsHebdomadaires() {
  try {
    const cotisations = await Cotisation.find({ statut: 'en_cours' }).populate('client', 'nom prenom telephone');
    for (const c of cotisations) {
      if (!c.client || !c.client.telephone) continue;
      const pct = Math.round((c.montantCollecte / c.montantObjectif) * 100);
      const message = `Bonjour ${c.client.prenom}, rappel BIOSAVEUR: votre cotisation est a ${pct}% (${c.montantCollecte}/${c.montantObjectif} FCFA). Continuez vos versements pour atteindre votre objectif !`;
      try {
        await envoyerSMS(c.client.telephone, message);
      } catch (smsErr) {
        console.error('Erreur SMS rappel pour', c.client.telephone, smsErr);
      }
    }
    console.log('Rappels SMS hebdomadaires envoyes:', cotisations.length);
  } catch (err) {
    console.error('Erreur envoi rappels SMS:', err);
  }
}

const SEPT_JOURS = 7 * 24 * 60 * 60 * 1000;
setInterval(envoyerRappelsHebdomadaires, SEPT_JOURS);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/cotisations', require('./routes/cotisations'));
app.use('/api/cinetpay', require('./routes/cinetpay'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/commandes', require('./routes/commandes'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Gestion des erreurs non catchées
process.on('uncaughtException', (err) => {
  console.error('Erreur non catchée:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Promesse rejetée:', reason);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Serveur démarré sur http://localhost:' + PORT));

module.exports = app;
