/* eslint-env serviceworker */

/**
 * Offline support for the learning platform.
 *
 * The previous worker used cache-first for *every* request, including
 * `/index.html`. Because index.html names the content-hashed bundles, a
 * returning visitor kept getting the old HTML from cache forever; it pointed at
 * asset filenames that no longer existed after a deploy, and the app rendered a
 * blank page. That is why index.html grew an inline script unregistering all
 * service workers and deleting every cache on load — a workaround that also
 * disabled offline support entirely and ran a cache teardown on every page view.
 *
 * The fix is to route by request type:
 *   - navigations   → network-first, falling back to the cached shell offline;
 *   - hashed assets → cache-first (safe: the filename changes when content does);
 *   - everything else → network, with a cache fallback.
 */

const VERSION = 'v4';
const SHELL_CACHE = `ai6g-shell-${VERSION}`;
const ASSET_CACHE = `ai6g-assets-${VERSION}`;

const SHELL_URLS = ['/', '/index.html', '/manifest.json', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // `allSettled`: one missing optional file must not abort the install and
      // leave the worker permanently un-activated.
      await Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((name) => !keep.has(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

/** Vite emits content-hashed filenames; those are immutable and safe to cache indefinitely. */
function isHashedAsset(url) {
  return /\/assets\/.+-[A-Za-z0-9_-]{8,}\./.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never interfere with non-GET traffic (the lab authorization POST, for one).
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: always try the network first so a deploy is picked up at once.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          await cache.put('/index.html', response.clone());
          return response;
        } catch {
          const cached = await caches.match('/index.html', { cacheName: SHELL_CACHE });
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request, { cacheName: ASSET_CACHE });
        if (cached) return cached;

        const response = await fetch(request);
        // Only cache complete same-origin successes. Caching a 206 or an opaque
        // error is what makes an app fail permanently once offline.
        if (response.status === 200 && response.type === 'basic') {
          const cache = await caches.open(ASSET_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        const cached = await caches.match(request);
        return cached ?? Response.error();
      }
    })(),
  );
});

// Lets the page trigger an immediate update instead of waiting for all tabs to close.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') void self.skipWaiting();
});
