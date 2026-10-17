/* Arrivée depuis l'ancienne adresse du jeu (voir demenagement.js). Ce petit script passe avant tout le reste, parce que la musique et
   les sons lisent leurs réglages dès leur chargement : il reprend les réglages apportés, puis le code de passage quitte la barre
   d'adresse pour la mémoire de cet onglet, où demenagement.js le prendra pour ouvrir la connexion.
   (« bcorps-cartes- » : le préfixe STORE de config.js.) */
(() => {
  const PASS = '#passage?', STORE = 'bcorps-cartes-', NOT_KEPT = ['session', 'catalogue'];
  if (!location.hash.startsWith(PASS)) return;
  const params = new URLSearchParams(location.hash.slice(PASS.length));
  const to = params.get('vers') || '';
  history.replaceState(null, '', location.pathname + location.search + (/^\/[\w/-]*$/.test(to) ? '#' + to : ''));
  try {
    const settings = JSON.parse(params.get('reglages') || '{}');
    for (const [k, v] of Object.entries(settings)) {
      /* un réglage déjà fait à la nouvelle adresse est plus récent : on le garde */
      if (typeof v === 'string' && /^[\w-]{1,40}$/.test(k) && !NOT_KEPT.includes(k) && localStorage.getItem(STORE + k) === null) localStorage.setItem(STORE + k, v);
    }
  } catch (e) { /* réglages illisibles, ou mémoire du navigateur fermée : tant pis */ }
  const code = params.get('code') || '';
  try { if (/^[0-9a-f]{64}$/.test(code)) sessionStorage.setItem(STORE + 'passage', code); } catch (e) { /* sans mémoire d'onglet : il se reconnectera */ }
})();
