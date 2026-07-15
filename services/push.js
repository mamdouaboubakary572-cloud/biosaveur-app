const webpush = require('web-push');

async function envoyerPush(user, titre, message) {
  if (!user || !user.pushSubscription) return;
  try {
    await webpush.sendNotification(
      user.pushSubscription,
      JSON.stringify({ title: titre, body: message })
    );
  } catch (err) {
    console.error('Erreur push pour', user.telephone, ':', err.message);
  }
}

module.exports = { envoyerPush };
