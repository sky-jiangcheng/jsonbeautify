const CACHE_NAME = 'json-formatter-v14';
const urlsToCache = [
  '/jsonbeautify/',
  '/jsonbeautify/index.html?v=9',
  '/jsonbeautify/manifest.json?v=9',
  '/jsonbeautify/icon.svg?v=9',
  '/jsonbeautify/icon-192.png?v=9',
  '/jsonbeautify/icon-512.png?v=9',
  '/jsonbeautify/favicon-32.png?v=9'
];
const cdnUrls = [
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all([
        cache.addAll(urlsToCache),
        ...cdnUrls.map(url => cache.add(url))
      ]);
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
