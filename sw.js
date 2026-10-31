// Service worker: guarda los archivos de la app en el teléfono para que abra al instante y sin señal.
// Los datos (inventario, OP, MPS) NO pasan por aquí: los guarda la app en IndexedDB.
importScripts('js/config.js');
const CACHE = 'manaplas-app-' + self.APP_CONFIG.VERSION;
const ARCHIVOS = [
  './',
  'index.html',
  'css/app.css',
  'js/config.js',
  'js/db.js',
  'js/api.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith('manaplas-app-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // la API va directo a internet
  const base = new URL('./', self.location).pathname;
  const ruta = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : url.pathname;
  const esDeLaApp = ruta === '' || ARCHIVOS.includes(ruta) || ruta.startsWith('icons/');
  if (!esDeLaApp) return;                                  // cualquier otra cosa: directo a la red

  // config.js: primero la red (así los teléfonos se enteran de versiones nuevas)
  if (ruta === 'js/config.js') {
    e.respondWith(fetch(e.request).then(r => {
      const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r;
    }).catch(() => caches.match(e.request)));
    return;
  }
  // Resto de archivos de la app: primero lo guardado (abre al instante y sin señal)
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(resp => {
      if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
      return resp;
    }))
  );
});
