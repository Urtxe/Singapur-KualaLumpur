export type CacheStatus = { version: string; total: number; cached: number; missing: number; complete: boolean; missingUrls?: string[]; error?: string };

let registration: ServiceWorkerRegistration | undefined;
let waitingWorker: ServiceWorker | undefined;
let adopting = false;
let bootstrapStarted = false;
let registrationPromise: Promise<ServiceWorkerRegistration | undefined> | undefined;
let updateTimer = 0;
const observedRegistrations = new WeakSet<ServiceWorkerRegistration>();

function updatePrompt(worker: ServiceWorker) {
  waitingWorker = worker;
  window.dispatchEvent(new CustomEvent('asia-trip-sw-update', { detail: { version: 'available' } }));
  let banner = document.querySelector<HTMLElement>('[data-sw-update]');
  if (!banner) {
    banner = document.createElement('aside');
    banner.dataset.swUpdate = '';
    banner.className = 'sw-update-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = '<span>Hay una actualización de Asia Trip lista.</span><button type="button" data-sw-adopt>Actualizar ahora</button><button type="button" data-sw-dismiss aria-label="Cerrar aviso">×</button>';
    document.body.append(banner);
    banner.querySelector('[data-sw-adopt]')?.addEventListener('click', () => {
      if (!waitingWorker) return;
      adopting = true;
      const button = banner?.querySelector<HTMLButtonElement>('[data-sw-adopt]');
      if (button) { button.disabled = true; button.textContent = 'Actualizando…'; }
      waitingWorker.postMessage('SKIP_WAITING');
    });
    banner.querySelector('[data-sw-dismiss]')?.addEventListener('click', () => banner?.remove());
  }
  banner.hidden = false;
}

function observe(reg: ServiceWorkerRegistration) {
  registration = reg;
  if (observedRegistrations.has(reg)) return;
  observedRegistrations.add(reg);
  const announceWaiting = () => {
    const worker = reg.waiting;
    const controller = navigator.serviceWorker.controller;
    if (worker && controller && worker !== controller) updatePrompt(worker);
  };
  announceWaiting();
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') announceWaiting();
    });
  });
}

export function registerSW(): void {
  if (!('serviceWorker' in navigator)) return;
  if (bootstrapStarted) return;
  bootstrapStarted = true;
  const scopeURL = new URL(import.meta.env.BASE_URL, location.href).href;
  const registerWhenOnline = async () => {
    if (!navigator.onLine) return;
    if (registrationPromise) return registrationPromise;
    registrationPromise = (async () => {
      const existing = registration ?? await navigator.serviceWorker.getRegistration(scopeURL).catch(() => undefined);
      if (existing) {
        observe(existing);
        if (existing.active) void existing.update().catch(() => undefined);
        return existing;
      }
      const created = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' });
      observe(created);
      return created;
    })().catch((error: unknown) => {
      console.error('Service worker registration failed', error);
      window.dispatchEvent(new CustomEvent('asia-trip-sw-error'));
      return undefined;
    }).finally(() => { registrationPromise = undefined; });
    const current = await registrationPromise;
    if (!current || !navigator.onLine) return;
    if (!updateTimer) updateTimer = window.setInterval(() => {
      if (navigator.onLine && registration) void registration.update().catch(() => undefined);
    }, 6 * 60 * 60 * 1000);
  };
  window.addEventListener('load', () => {
    void navigator.serviceWorker.getRegistration(scopeURL).then(existing => {
      if (existing) observe(existing);
      if (navigator.onLine) void registerWhenOnline();
    }).catch(() => {
      if (navigator.onLine) void registerWhenOnline();
    });
  }, { once: true });
  window.addEventListener('online', () => { void registerWhenOnline(); });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!adopting) return;
    try { localStorage.setItem(`asia-trip-sw-updated:${new URL(import.meta.env.BASE_URL, location.href).pathname}`, new Date().toISOString()); } catch { /* Diagnostics remain optional when storage is disabled. */ }
    location.reload();
  });
}

function requestWorker<T>(command: string, worker = navigator.serviceWorker?.controller ?? registration?.active): Promise<T> {
  if (!worker) return Promise.reject(new Error('El service worker todavía no está activo. Abre de nuevo esta pantalla cuando la conexión esté disponible.'));
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => { channel.port1.close(); reject(new Error('El diagnóstico offline ha tardado demasiado.')); }, 15_000);
    channel.port1.onmessage = (event: MessageEvent<T & { error?: string }>) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      if (event.data?.error) reject(new Error(event.data.error));
      else resolve(event.data);
    };
    worker.postMessage(command, [channel.port2]);
  });
}

export async function serviceWorkerVersion(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) return null;
  try { return (await requestWorker<{ version: string }>('GET_VERSION')).version; } catch { return null; }
}

export async function checkOfflineCache(): Promise<CacheStatus | null> {
  if (!('serviceWorker' in navigator)) return null;
  return requestWorker<CacheStatus>('CACHE_STATUS');
}

export async function prepareOfflineCache(): Promise<CacheStatus> {
  const container = navigator.serviceWorker;
  if (!container) throw new Error('Este navegador no permite preparar el almacenamiento offline.');
  let worker = container.controller ?? registration?.active;
  if (!worker && navigator.onLine) {
    // On a first visit, the worker becomes ready after it has cached the trip assets.
    let timeout = 0;
    try {
      const ready = await Promise.race([
        container.ready,
        new Promise<never>((_, reject) => {
          timeout = window.setTimeout(() => reject(new Error('La preparación inicial sin conexión ha tardado demasiado.')), 10_000);
        }),
      ]);
      worker = ready.active;
    } finally {
      window.clearTimeout(timeout);
    }
  }
  return requestWorker<CacheStatus>('PREPARE_OFFLINE', worker);
}

export async function waitingUpdateAvailable(): Promise<boolean> {
  const active = await navigator.serviceWorker?.getRegistration(`${new URL(import.meta.env.BASE_URL, location.href).origin}${new URL(import.meta.env.BASE_URL, location.href).pathname}`);
  if (active) observe(active);
  return !!active?.waiting;
}

export function applyWaitingUpdate(): boolean {
  const worker = waitingWorker ?? registration?.waiting;
  if (!worker) return false;
  adopting = true;
  worker.postMessage('SKIP_WAITING');
  return true;
}

export function lastServiceWorkerUpdate(): string | null {
  try { return localStorage.getItem(`asia-trip-sw-updated:${new URL(import.meta.env.BASE_URL, location.href).pathname}`); } catch { return null; }
}
