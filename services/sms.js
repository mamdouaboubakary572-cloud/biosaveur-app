const AfricasTalking = require('africastalking');

const at = AfricasTalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME
});

const sms = at.SMS;

const envoyerSMS = async (numero, message) => {
  try {
    const result = await sms.send({
      to: [numero],
      message: message
    });
    console.log('SMS envoyé:', result);
    return result;
  } catch (err) {
    console.error('Erreur SMS:', err);
    throw err;
  }
};

module.exports = { envoyerSMS };
