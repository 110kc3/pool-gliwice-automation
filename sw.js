const CACHE_NAME = 'gliwice-pools-v2';
const CORE_ASSETS = [
    './', 'index.html', 'style.css', 'script.js', 'manifest.webmanifest',
    'favicon.svg', 'favicon.ico', 'icons/icon-192.png', 'icons/icon-512.png',
    'icons/icon.svg', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME)
        .then(cache => cache.addAll(CORE_ASSETS))
        .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys
        .filter(key => key.startsWith('gliwice-pools-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || !url.href.startsWith(self.registration.scope)) return;

    const response = (async () => {
        try {
            const fresh = await fetch(event.request, { cache: 'no-cache' });
            if (fresh.ok) {
                try {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(event.request, fresh.clone());
                } catch (error) {
                    console.warn('Offline cache unavailable:', error);
                }
                return fresh;
            }
            const cached = await caches.match(event.request);
            return cached || fresh;
        } catch (error) {
            const cached = await caches.match(event.request);
            if (cached) return cached;
            if (event.request.mode === 'navigate') {
                const shell = await caches.match(new URL('index.html', self.registration.scope));
                if (shell) return shell;
            }
            return Response.error();
        }
    })();
    event.respondWith(response);
    event.waitUntil(response.then(() => undefined));
});
