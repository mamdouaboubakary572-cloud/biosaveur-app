self.addEventListener('install', e => e.waitUntil(
  caches.open('biosaveur-v1').then(cache => cache.addAll(['/','index.html','dashboard.html','client.html']))
));
self.addEventListener('fetch', e => e.respondWith(
  caches.match(e.request).then(r => r || fetch(e.request))
));
