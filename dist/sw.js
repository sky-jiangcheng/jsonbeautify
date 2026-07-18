const CACHE_NAME = 'json-formatter-v12';
const urlsToCache = [
  '/jsonbeautify/',
  '/jsonbeautify/index.html',
  '/jsonbeautify/manifest.json',
  '/jsonbeautify/highlight.min.js',
  '/jsonbeautify/highlight-atom-one-dark.min.css',
  '/jsonbeautify/highlight-atom-one-light.min.css',
  '/jsonbeautify/icon.svg?v=8',
  '/jsonbeautify/icon-192.png?v=8',
  '/jsonbeautify/icon-512.png?v=8',
  '/jsonbeautify/favicon-32.png?v=7'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});
