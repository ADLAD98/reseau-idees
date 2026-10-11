/* Service worker de Bcorps Labs : garde une copie du site pour qu'il s'ouvre hors connexion.
   Le réseau reste prioritaire, pour que chaque mise à jour du site arrive tout de suite ;
   la copie ne sert que lorsque le réseau ne répond pas. */
const CACHE = 'bcorps-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'patchnotes.json', 'img/icon-192.png', 'img/bistro-boss-icone.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  /* GitHub (coffre, patch notes) et tout autre site externe passent directement, sans copie */
  if (url.origin !== self.location.origin && !fonts) return;

  if (fonts) {
    /* les polices ne changent pas : la copie d'abord */
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() =>
      caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))
    )
  );
});
