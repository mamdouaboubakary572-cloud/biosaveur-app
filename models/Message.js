const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  contenu: { type: String, required: true },
  lu: { type: Boolean, default: false },
  reponse: { type: String, default: '' },
  dateEnvoi: { type: Date, default: Date.now },
  dateReponse: { type: Date }
});

module.exports = mongoose.model('Message', messageSchema);
