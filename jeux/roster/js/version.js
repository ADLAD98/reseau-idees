/* Un onglet resté ouvert garde l'ancienne version du jeu tant qu'on ne recharge pas la page : le joueur ne verrait pas ce qui vient
   d'être publié. Ici, le jeu demande de temps en temps au site la date de sa dernière publication ; si elle est plus récente que celle
   de la page ouverte, il prévient (onNew). freshReload() recharge alors la page en redemandant chaque fichier au site, sans se fier à
   la mémoire du navigateur. */
const HOME = new URL('../', import.meta.url).href;
const EVERY = 4 * 60000, MARK = 'bcorps-cartes-version';
/* la date de publication de la page ouverte, telle que le navigateur l'a reçue (0 : inconnue) */
const mine = Date.parse(document.lastModified) || 0;
let latest = 0;

/** La date de la dernière publication du site (0 : pas de réponse). */
async function published() {
  try {
    const res = await fetch(HOME + 'index.html', { method: 'HEAD', cache: 'no-store' });
    return res.ok ? Date.parse(res.headers.get('last-modified') || '') || 0 : 0;
  } catch (e) { return 0; }
}

/** Surveille les publications du site : onNew est appelé une fois, quand il existe une version plus récente que la page ouverte. */
export function watchVersion(onNew) {
  if (!mine) return;
  let told = false, done = 0;
  try { done = Number(sessionStorage.getItem(MARK)) || 0; } catch (e) { /* pas de mémoire de session : tant pis */ }
  const check = async () => {
    if (told || document.hidden) return;
    const now = await published();
    /* deux secondes de marge (les deux dates n'ont pas la même précision) ; et une version pour laquelle la page vient déjà d'être
       rechargée n'est pas signalée une seconde fois : jamais de rechargement en boucle */
    if (!told && now > mine + 2000 && now > done) { told = true; latest = now; onNew(); }
  };
  setInterval(check, EVERY);
  document.addEventListener('visibilitychange', check);
  setTimeout(check, 15000);
}

/** Recharge la page avec la version publiée : chaque fichier déjà chargé est redemandé au site avant le rechargement. */
export async function freshReload() {
  try { sessionStorage.setItem(MARK, String(latest)); } catch (e) { /* pas de mémoire de session */ }
  const urls = new Set([HOME, HOME + 'index.html']);
  for (const e of performance.getEntriesByType('resource')) {
    const u = e.name.split('#')[0];
    if (u.startsWith(HOME) && /\.(js|css|json)(\?|$)/.test(u)) urls.add(u);
  }
  await Promise.race([Promise.allSettled([...urls].map((u) => fetch(u, { cache: 'reload' }))), new Promise((r) => setTimeout(r, 8000))]);
  location.reload();
}
