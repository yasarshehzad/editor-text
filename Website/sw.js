/**
 * Editor Text (editortext.com)
 * Progressive Web App - Service Worker v1.0.15
 */

const CACHE_NAME = 'editor-text-v1.0.15';
const STATIC_ASSETS = [
  '/',
  'index.html',
  'styles.css?v=1.0.15',
  'app.js?v=1.0.15',
  'manifest.json',
  'images/logo.png',
  'about.html',
  'privacy.html',
  'terms.html'
];

// Install: Cache critical application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up previous cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-first for HTML documents, Cache-first for assets
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // HTML page navigation: Try network first, fall back to cached page
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((res) => res || caches.match('/index.html') || caches.match('index.html')))
    );
    return;
  }

  // Static assets (CSS, JS, Images, Fonts)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Fetch in background to update cache for next time
        fetch(event.request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkRes));
          }
        }).catch(() => {});
        return cached;
      }

      return fetch(event.request).then((networkRes) => {
        if (networkRes && networkRes.status === 200 && (url.origin === location.origin || url.hostname.includes('gstatic.com') || url.hostname.includes('googleapis.com'))) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkRes;
      }).catch(() => {
        // Offline fallback
        return null;
      });
    })
  );
});
