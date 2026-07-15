const CACHE_NAME = 'biosaveur-v3';
const URLS_A_METTRE_EN_CACHE = [
  '/logo_biosaveur.png',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_A_METTRE_EN_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(noms => Promise.all(
      noms.filter(nom => nom !== CACHE_NAME).map(nom => caches.delete(nom))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'BIOSAVEUR', body: 'Nouvelle notification' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/logo_biosaveur.png',
      badge: '/logo_biosaveur.png'
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/client.html'));
});
