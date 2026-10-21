/* global self, caches, fetch, URL, Request, Response */
const BUILD = { version: 'development', base: '/', shell: [], assets: [] }; // LIFESIM_BUILD_CONFIG
const PREFIX = `lifesim:${BUILD.base}:`;
const CACHE = PREFIX + BUILD.version;
const resource = (path) => new URL(path, self.registration.scope).href;
const allowed = new Set(BUILD.assets.map(resource));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(BUILD.shell.map((path) => new Request(resource(path), { cache: 'reload' }))),
      ),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(PREFIX) && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'LIFESIM_APPLY_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (
    request.method !== 'GET' ||
    url.origin !== scope.origin ||
    !url.pathname.startsWith(scope.pathname)
  )
    return;
  const key = url.origin + url.pathname;
  if (
    request.mode === 'navigate' &&
    (key === scope.origin + scope.pathname || key === resource('index.html'))
  ) {
    // Serve the shell belonging to this worker; a newer index must wait for explicit activation.
    event.respondWith(
      caches
        .open(CACHE)
        .then(async (cache) => (await cache.match(resource('index.html'))) ?? fetch(request))
        .catch(() => fetch(request)),
    );
    return;
  }
  if (!allowed.has(key)) {
    if (url.pathname.startsWith(scope.pathname + 'assets/')) {
      event.respondWith(
        Promise.resolve(
          new Response('LifeSim version changed. Refresh to update.', { status: 409 }),
        ),
      );
      event.waitUntil(
        self.clients
          .get(event.clientId)
          .then((client) => client?.postMessage({ type: 'LIFESIM_VERSION_MISMATCH' })),
      );
    }
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(key);
      if (cached) return cached;
      try {
        const response = await fetch(key);
        if (response.ok) {
          try {
            await cache.put(key, response.clone());
          } catch {
            if (event.clientId) {
              try {
                const client = await self.clients.get(event.clientId);
                client?.postMessage({ type: 'LIFESIM_CACHE_FAILED' });
              } catch {
                /* A closing page cannot receive a cache-status message. */
              }
            }
          }
        }
        return response;
      } catch {
        return new Response(
          '此内容尚未离线缓存，请联网重试。 This content is not cached. Connect and retry.',
          { status: 503 },
        );
      }
    })(),
  );
});
