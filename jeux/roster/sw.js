/* Le service worker de Roster : il ne sert qu'aux notifications (le rappel « ton pack gratuit est prêt », rappels.js) et ne garde
   aucune copie du jeu — chaque page vient toujours du site. */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
  e.waitUntil(self.registration.showNotification(d.title || 'Roster', {
    body: d.body || '',
    icon: 'img/icone-192.png',
    tag: d.tag || 'roster',
    data: { url: d.url || './#/packs' },
  }));
});

/* toucher la notification : le jeu, déjà ouvert s'il l'est, sur la page des packs */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './#/packs', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    if (open) return open.focus().then((c) => (c && c.navigate ? c.navigate(url) : c));
    return self.clients.openWindow(url);
  }));
});
