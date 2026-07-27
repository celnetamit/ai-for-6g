/**
 * Registers the service worker and prompts once when a new build is waiting.
 *
 * Registration is deliberately deferred until after `load`: doing it during
 * startup competes with the route chunks for bandwidth on the very first visit,
 * which is when the app can least afford it.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  // A worker in dev would serve stale modules and mask HMR updates.
  if (import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener('statechange', () => {
            // `controller` is null on the very first install; only an update to
            // an already-controlled page warrants interrupting the user.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage('SKIP_WAITING');
            }
          });
        });
      })
      .catch(() => {
        // Registration failing is not fatal — the app works fine without offline
        // support, so this must never surface as an error to the learner.
      });
  });

  // Whether this page was already controlled when it loaded.
  //
  // On a first visit the worker's `clients.claim()` also fires
  // `controllerchange`. Reloading on that would bounce every new visitor once,
  // immediately after their first paint. Only an update to an already-controlled
  // page justifies a reload.
  const wasControlled = Boolean(navigator.serviceWorker.controller);
  let hasReloaded = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!wasControlled || hasReloaded) return;
    hasReloaded = true;
    window.location.reload();
  });
}

/**
 * Removes any worker registered by an earlier build.
 *
 * Kept for the transition: visitors who loaded the old cache-first worker still
 * have it installed, and it would keep serving them a stale index.html.
 */
export async function unregisterLegacyServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  await Promise.all(registrations.map((registration) => registration.unregister()));
}
