import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { defineConfig } from 'vite';

function offlinePrecache(): Plugin {
  let outDir = 'dist';
  return {
    name: 'offline-precache',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      outDir = config.build.outDir;
    },
    async writeBundle() {
      const collect = async (directory: string): Promise<string[]> => {
        const entries = await readdir(resolve(outDir, directory), { withFileTypes: true });
        const nested = await Promise.all(entries.map(async (entry) => {
          if (entry.name.startsWith('.')) return [];
          const relative = directory ? `${directory}/${entry.name}` : entry.name;
          if (entry.isDirectory()) return collect(relative);
          return relative === 'sw.js' || relative.endsWith('.map') ? [] : [relative];
        }));
        return nested.flat();
      };
      const paths = (await collect('')).sort();
      const hash = createHash('sha256');
      for (const file of paths) hash.update(file).update(await readFile(resolve(outDir, file)));
      const revision = hash.digest('hex').slice(0, 12);
      const source = `const VERSION = '${revision}';
const CACHE_PREFIX = 'asia-trip:' + encodeURIComponent(new URL(self.registration.scope).pathname) + ':';
const CACHE_NAME = CACHE_PREFIX + '${revision}';
const PRECACHE = ${JSON.stringify(paths)}.map((path) => new URL(path, self.registration.scope).href);
const SHELL = new URL('index.html', self.registration.scope).href;
const match = (request) => caches.open(CACHE_NAME).then((cache) => cache.match(request));
const cacheStatus = async () => {
  const cache = await caches.open(CACHE_NAME);
  const missing = [];
  for (const url of PRECACHE) if (!(await cache.match(url))) missing.push(url);
  return { version: VERSION, total: PRECACHE.length, cached: PRECACHE.length - missing.length, missing: missing.length, complete: missing.length === 0 };
};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  const port = event.ports && event.ports[0];
  const reply = (data) => { if (port) port.postMessage(data); };
  if (event.data === 'SKIP_WAITING') { void self.skipWaiting(); return; }
  if (event.data === 'GET_VERSION') { reply({ version: VERSION, cache: CACHE_NAME }); return; }
  if (event.data === 'CACHE_STATUS') {
    event.waitUntil(cacheStatus().then(reply).catch((error) => reply({ version: VERSION, error: String(error) })));
    return;
  }
  if (event.data === 'PREPARE_OFFLINE') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      const missingUrls = [];
      for (const url of PRECACHE) {
        if (await cache.match(url)) continue;
        try {
          const response = await fetch(url, { cache: 'reload' });
          if (!response.ok || response.type === 'opaque') throw new Error('Recurso no disponible');
          await cache.put(url, response);
        } catch { missingUrls.push(url); }
      }
      reply({ ...(await cacheStatus()), missingUrls });
    })().catch((error) => reply({ version: VERSION, error: String(error) })));
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const documentURL = url.origin + url.pathname;
  if (request.mode === 'navigate' && url.origin === new URL(self.registration.scope).origin && url.pathname.startsWith(new URL(self.registration.scope).pathname)) {
    event.respondWith(fetch(request).catch(() => match(SHELL)));
    return;
  }
  if (PRECACHE.includes(request.url)) event.respondWith(match(request).then((cached) => cached || fetch(request)));
});
`;
      await writeFile(resolve(outDir, 'sw.js'), source);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [offlinePrecache()],
  build: { outDir: 'dist', emptyOutDir: true },
});
