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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cotisations', require('./routes/cotisations'));
app.use('/api/commandes', require('./routes/commandes'));
app.use('/api/admin', require('./routes/admin'));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;