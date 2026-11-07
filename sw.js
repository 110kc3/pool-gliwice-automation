// Service Worker for Gliwice Pool Automation PWA
const CACHE_NAME = 'gliwice-pools-v1';
const CORE_ASSETS = [
    './',
    'index.html',
    'style.css',
    'script.js',
    'manifest.webmanifest',
    'favicon.svg',
    'favicon.ico',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon.svg',
    'icons/apple-touch-icon.png'
];

// Install: Cache core static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(CORE_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Activate: Clean up old cache versions & take immediate control
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

// Fetch: Network-first with cache fallback for data.json, Cache-first for static assets
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Dynamic schedule data: Network-First (always prefer fresh data, fallback to cache when offline)
    if (url.pathname.endsWith('data.json')) {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match(event.request);
                })
        );
        return;
    }

    // Static Assets: Cache-First with Network fallback
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
                    const copy = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return networkResponse;
            });
        })
    );
});
