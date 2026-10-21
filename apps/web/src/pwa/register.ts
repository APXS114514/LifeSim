export interface PwaState {
  offline: boolean;
  ready: boolean;
  unavailable: boolean;
  updateAvailable: boolean;
}
let snapshot: PwaState = Object.freeze({
  offline: typeof navigator !== 'undefined' && !navigator.onLine,
  ready: false,
  unavailable: false,
  updateAvailable: false,
});
const listeners = new Set<() => void>();
let registration: ServiceWorkerRegistration | null = null;
let requestedUpdate = false;
let started = false;
function publish(next: Partial<PwaState>): void {
  if (Object.entries(next).every(([key, value]) => snapshot[key as keyof PwaState] === value))
    return;
  snapshot = Object.freeze({ ...snapshot, ...next });
  for (const listener of listeners) listener();
}
export function subscribePwa(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function pwaSnapshot(): PwaState {
  return snapshot;
}
export function applyPwaUpdate(): void {
  if (!navigator.onLine) return;
  if (registration?.waiting) {
    requestedUpdate = true;
    registration.waiting.postMessage({ type: 'LIFESIM_APPLY_UPDATE' });
  } else window.location.reload();
}
export async function registerPwa(base: string): Promise<void> {
  if (started) return;
  started = true;
  const onlineChanged = () => publish({ offline: !navigator.onLine });
  window.addEventListener('online', onlineChanged);
  window.addEventListener('offline', onlineChanged);
  if (!('serviceWorker' in navigator)) {
    publish({ unavailable: true });
    return;
  }
  try {
    let hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (requestedUpdate) {
        window.location.reload();
        return;
      }
      publish({ ready: true, ...(hadController ? { updateAvailable: true } : {}) });
      hadController = true;
    });
    navigator.serviceWorker.addEventListener('message', (event: MessageEvent<unknown>) => {
      const value = event.data;
      if (typeof value !== 'object' || value === null || !('type' in value)) return;
      if (value.type === 'LIFESIM_VERSION_MISMATCH') publish({ updateAvailable: true });
      if (value.type === 'LIFESIM_CACHE_FAILED') publish({ unavailable: true });
    });
    registration = await navigator.serviceWorker.register(base + 'sw.js', {
      scope: base,
      updateViaCache: 'none',
    });
    const current = registration;
    const observe = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const changed = () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller)
          publish({ updateAvailable: true });
        if (worker.state === 'activated') publish({ ready: true });
        if (worker.state === 'redundant' && !current.active) publish({ unavailable: true });
      };
      worker.addEventListener('statechange', changed);
      changed();
    };
    if (current.active) publish({ ready: true });
    if (current.waiting) publish({ updateAvailable: true });
    observe(current.installing);
    current.addEventListener('updatefound', () => observe(current.installing));
  } catch {
    publish(navigator.serviceWorker.controller ? { ready: true } : { unavailable: true });
  }
}
