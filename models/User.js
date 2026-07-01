const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  nom: { type: String, required: true },
  prenom: { type: String, required: true },
  telephone: { type: String, required: true, unique: true },
  email: { type: String },
  motDePasse: { type: String, required: true },
  role: { type: String, default: 'client' },
  qrCode: { type: String },
  photo: { type: String, default: '' },
localisation: { type: String, default: '' },
  dateCreation: { type: Date, default: Date.now }
});

userSchema.methods.verifierMotDePasse = async function(mdp) {
  return await bcrypt.compare(mdp, this.motDePasse);
};

module.exports = mongoose.model('User', userSchema);
