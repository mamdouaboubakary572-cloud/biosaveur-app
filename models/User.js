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
  jourNaissance: { type: Number, min: 1, max: 31 },
  moisNaissance: { type: Number, min: 1, max: 12 },
  codeParrainage: { type: String, unique: true, sparse: true },
parrainId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
points: { type: Number, default: 0 },
  dateCreation: { type: Date, default: Date.now }
});

userSchema.methods.verifierMotDePasse = async function(mdp) {
  return await bcrypt.compare(mdp, this.motDePasse);
};

module.exports = mongoose.model('User', userSchema);
