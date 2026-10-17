/* Le jeu a changé d'adresse le 17/10/2026 : il est maintenant sur bcorpslabs.com. Ouvert à l'ancienne adresse (GitHub Pages), il y
   emmène le joueur avec sa connexion et ses réglages, sans qu'il ait à se reconnecter : le serveur donne un code à usage unique,
   valable deux minutes, que la nouvelle adresse échange contre une connexion neuve. Tout voyage après le « # » de l'adresse, partie
   qu'un navigateur n'envoie à aucun site ; à l'arrivée, arrivee.js reprend les réglages et efface aussitôt le code de la barre d'adresse.
   Face à un serveur qui ne connaît pas encore ce passage, ou injoignable, le jeu reste où il est cette fois-ci. */
import { ApiError, call, loadSession, saveSession } from './api.js';
import { HOME_URL, OLD_HOSTS, STORE } from './config.js';

/* ce qui ne suit pas le joueur : sa connexion (remplacée par le code) et la copie du catalogue (redemandée là-bas) */
const NOT_KEPT = ['session', 'catalogue'];

export const isOldHome = () => OLD_HOSTS.includes(location.hostname);

/** À l'ancienne adresse : emmène le joueur à la nouvelle. true : le départ est lancé. */
export async function moveIfOld() {
  if (!isOldHome()) return false;
  const params = new URLSearchParams();
  if (loadSession()) {
    try {
      params.set('code', (await call('POST', '/api/transfer')).code);
    } catch (e) {
      /* connexion expirée : il se reconnectera là-bas ; serveur sans ce passage, ou injoignable : on reste ici pour cette fois */
      if (!(e instanceof ApiError && e.status === 401)) return false;
    }
  }
  const settings = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(STORE) && !NOT_KEPT.includes(k.slice(STORE.length))) settings[k.slice(STORE.length)] = localStorage.getItem(k);
    }
  } catch (e) { /* réglages illisibles : il les refera */ }
  params.set('reglages', JSON.stringify(settings));
  if (/^#\/[\w/-]*$/.test(location.hash)) params.set('vers', location.hash.slice(1));
  location.replace(HOME_URL + '#passage?' + params);
  return true;
}

/** À la nouvelle adresse, à l'arrivée : ouvre la connexion avec le code de passage laissé par arrivee.js. */
export async function takeTransfer() {
  let code = null;
  try {
    code = sessionStorage.getItem(STORE + 'passage');
    sessionStorage.removeItem(STORE + 'passage');
  } catch (e) { return; }
  if (!code) return;
  try {
    const data = await call('POST', '/api/transfer/use', { code });
    saveSession({ token: data.token, name: data.player.name });
  } catch (e) { /* passage expiré ou déjà servi : il se reconnectera */ }
}
