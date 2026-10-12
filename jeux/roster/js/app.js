/* Roster — le jeu. Six écrans : Packs, Jouer (matchs, Mondial), Collection, Marché, Joueurs (amis, échanges, défis, classement), Profil.
   Le serveur décide de tout (cartes tirées, délais, collection, matchs, ventes, échanges) ; cette page affiche et met en scène. */
import { ApiError, call, clearSession, deriveKey, loadSession, saveSession } from './api.js';
import { VARIANTS, cardHTML, champName, esc, flagUrl, iconUrl, karmineEra, prepare, statsOf, tiltCard, variantRank } from './cards.js';
import { GAME_NAME, ROLE_NAME, ROLE_ORDER, STORE } from './config.js';
import { createDuels } from './duel.js';
import { sellCard, showOnMarket, viewMarket } from './market.js';
import { packHTML, runOpening } from './opening.js';
import { viewPlay } from './play.js';
import { viewSocial } from './social.js';
import { setSound, sfx, soundOn } from './sound.js';
import { viewWorlds } from './worlds.js';

const app = document.getElementById('app');
const $ = (sel, root) => (root || document).querySelector(sel);
const NAME_RULE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,15}$/;
const TABS = [
  ['packs', 'Packs', 'i-pack'],
  ['jouer', 'Jouer', 'i-play'],
  ['collection', 'Collection', 'i-cards'],
  ['marche', 'Marché', 'i-market'],
  ['joueurs', 'Joueurs', 'i-friends'],
  ['profil', 'Profil', 'i-user'],
];
/* tant que le serveur n'a pas reçu la vie en ligne (marché, amis, défis), le jeu garde ses anciens onglets */
const TABS_BEFORE = [TABS[0], TABS[1], TABS[2], ['classement', 'Classement', 'i-board'], TABS[5]];
const tabs = () => (S.live ? TABS : TABS_BEFORE);
/** Le jeu donne signe de vie au serveur à ce rythme : c'est ce qui compte les joueurs en ligne et apporte les nouvelles. */
const PULSE_MS = 20000;

const S = {
  session: null,          // { token, name } gardé dans ce navigateur
  player: null,           // ce que le serveur dit du joueur
  free: null,             // pack gratuit : { readyAt, cooldownMs, size }
  skew: 0,                // heure du serveur − heure de cet appareil
  cat: null,              // catalogue des cartes
  owned: new Map(),       // identifiant de carte → { qty, at }
  /* group : '' (toutes les cartes à la suite) ou 'roster' (une page par équipe) ; rsort : ordre des rosters */
  filters: { q: '', league: '', team: '', role: '', tier: '', variant: '', own: '', sort: 'ovr', group: '', rsort: 'league' },
  fx: true,               // animations
  filtersOpen: false,     // listes de filtres dépliées (téléphone)
  opening: false,
  play: null,             // l'écran Jouer : équipe, adversaires, parties (dernière réponse du serveur)
  playLeague: '',         // ligue affichée dans la liste des adversaires
  autoDeck: false,        // la meilleure équipe a déjà été alignée d'office pendant cette visite
  busy: false,            // une draft ou une partie est à l'écran
  live: false,            // le serveur connaît la vie en ligne (marché, amis, défis, Mondial)
  pulse: null,            // dernières nouvelles du serveur : joueurs en ligne, demandes, invitations
  social: null,           // l'écran Joueurs
  market: null,           // l'écran Marché
  worlds: null,           // l'écran Mondial
};

/* ---------- petits outils ---------- */
const icon = (id) => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + id + '"/></svg>';
const now = () => Date.now() + S.skew;
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const frDate = (ms) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const frNum = (n) => String(n).replace('.', ',');
function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
function toast(message, bad) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), bad ? 5200 : 3200);
}
function applyState(data) {
  if (data.player) S.player = data.player;
  const credits = document.getElementById('credits');
  if (credits && S.player) credits.textContent = S.player.coins;
  if (data.free) S.free = data.free;
  if (typeof data.skew === 'number') S.skew = data.skew;
}
/** Lance une action qui parle au serveur ; une connexion expirée ramène à l'écran de connexion. */
async function guard(action) {
  try {
    return await action();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      clearSession();
      S.session = null;
      showAuth('Ta connexion a expiré. Reconnecte-toi.');
    } else {
      toast(e instanceof ApiError ? e.message : 'Un problème est survenu.', true);
      if (!(e instanceof ApiError)) console.error(e);
    }
    return null;
  }
}

/* ---------- démarrage ---------- */
async function loadCatalogue(version) {
  if (S.cat && (!version || S.cat.version === version)) return;
  let raw = null;
  try {
    const kept = JSON.parse(localStorage.getItem(STORE + 'catalogue') || 'null');
    if (kept && kept.cards && (!version || kept.version === version)) raw = kept;
  } catch (e) { raw = null; }
  if (!raw) {
    raw = await call('GET', '/api/catalogue');
    try { localStorage.setItem(STORE + 'catalogue', JSON.stringify(raw)); } catch (e) { /* pas de place : on le redemandera */ }
  }
  S.cat = prepare(raw);
}
async function loadCollection() {
  const data = await call('GET', '/api/collection');
  applyState(data);
  S.owned = new Map(data.cards.map((row) => [row[0], { qty: row[1], at: row[2] }]));
  return data;
}
async function loadGame() {
  const data = await loadCollection();
  await loadCatalogue(data.catalogVersion);
  /* le serveur connaît-il la vie en ligne ? (un serveur plus ancien répond « adresse inconnue ») */
  try {
    S.pulse = await call('GET', '/api/pulse');
    S.live = true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw e;
    S.live = false;
  }
}

/* ---------- le pouls : joueurs en ligne, nouvelles du serveur ---------- */
let pulsing = false;
async function pulse() {
  if (!S.session || !S.live || pulsing || document.hidden) return;
  pulsing = true;
  try {
    const data = await call('GET', '/api/pulse');
    S.pulse = data;
    drawPulse();
    /* ma collection ou mes crédits ont bougé sans moi (une vente, un échange accepté, un défi fini) : on se remet à jour */
    if (data.me && S.player && !S.busy && !S.opening && (data.me.coins !== S.player.coins || data.me.cards !== S.player.cardsTotal || data.me.spare !== (S.free ? S.free.spare : data.me.spare))) {
      await loadCollection();
      /* l'écran est redessiné, sauf si le joueur est en train d'écrire ou qu'une fenêtre est ouverte */
      const typing = document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
      if (!S.busy && !S.opening && !document.querySelector('.sheet') && !typing) route();
    }
    if (!S.busy) DUELS.incoming(data.inbox.duels);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) { clearSession(); S.session = null; showAuth('Ta connexion a expiré. Reconnecte-toi.'); }
  } finally {
    pulsing = false;
  }
}
function drawPulse() {
  const p = S.pulse, chip = document.getElementById('online');
  if (!p || !chip) return;
  chip.hidden = false;
  chip.querySelector('b').textContent = p.online;
  chip.title = p.online > 1 ? p.online + ' joueurs en ligne' : 'Tu es seul en ligne pour l\'instant';
  const pips = { joueurs: p.inbox.friends + p.inbox.trades + p.inbox.duels.length, marche: p.inbox.sales };
  document.querySelectorAll('[data-pip]').forEach((el) => { const n = pips[el.dataset.pip] || 0; el.textContent = n ? String(n) : ''; el.hidden = !n; });
  /* un défi en cours que le joueur a quitté : un bandeau pour y revenir */
  let bar = document.getElementById('duelBar');
  if (p.duel && !S.busy) {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'duelBar';
      bar.className = 'bar-note';
      bar.innerHTML = '<span>Un défi est en cours.</span><button class="btn primary slim" type="button">Reprendre</button>';
      bar.querySelector('button').addEventListener('click', () => { bar.remove(); DUELS.resume(S.pulse.duel); });
      document.body.appendChild(bar);
    }
  } else if (bar) bar.remove();
}
setInterval(pulse, PULSE_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pulse(); });
async function boot() {
  try { S.fx = localStorage.getItem(STORE + 'fx') !== '0'; } catch (e) { S.fx = true; }
  try {
    const kept = (localStorage.getItem(STORE + 'classeur') || '').split('/');
    S.filters.group = kept[0] === 'roster' ? 'roster' : '';
    if (['league', 'done', 'rating'].includes(kept[1])) S.filters.rsort = kept[1];
  } catch (e) { /* réglage non gardé */ }
  document.body.classList.toggle('fx', S.fx);
  S.session = loadSession();
  if (!S.session) return showAuth();
  app.innerHTML = '<div class="center"><div><div class="spin"></div>Connexion au serveur…</div></div>';
  try {
    await loadGame();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) { clearSession(); S.session = null; return showAuth(); }
    app.innerHTML = '<div class="center"><div><p>' + esc(e.message || 'Serveur injoignable.') + '</p><p style="margin-top:16px"><button class="btn" id="retry">Réessayer</button></p></div></div>';
    $('#retry').addEventListener('click', boot);
    return;
  }
  shell();
  route();
}

/* ---------- connexion ---------- */
function showAuth(message) {
  let mode = 'login';
  app.innerHTML = '<div class="auth"><div class="auth-brand">'
    + '<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><use href="#mark"/></svg>'
    + '<h1>' + esc(GAME_NAME) + '</h1>'
    + '<p>Ouvre des packs, collectionne les joueurs et les coachs pros de la saison, compose ton équipe et fais-la jouer.</p>'
    + '<div class="auth-fan" id="fan"></div></div>'
    + '<form class="auth-form panel" id="authForm" novalidate>'
    + '<div class="seg"><button type="button" data-mode="login" class="on">Connexion</button><button type="button" data-mode="register">Créer un compte</button></div>'
    + '<label class="field">Pseudo<input name="name" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="16" required></label>'
    + '<label class="field">Mot de passe<input name="password" type="password" autocomplete="current-password" required></label>'
    + '<label class="field" data-only="register" hidden>Mot de passe, une seconde fois<input name="password2" type="password" autocomplete="new-password"></label>'
    + '<p class="hint" data-only="register" hidden>Aucune adresse e-mail n\'est demandée : note bien ton mot de passe, il ne pourra pas être retrouvé.</p>'
    + '<p class="form-error" role="alert">' + esc(message || '') + '</p>'
    + '<button class="btn primary big" type="submit">Entrer</button>'
    + '<p class="legal">Projet de fan gratuit, sans lien avec Riot Games ni avec les équipes citées. <a href="../../">Retour à Bcorps Labs</a></p>'
    + '</form></div>';
  const form = $('#authForm'), error = $('.form-error', form), submit = $('button[type=submit]', form);
  const setMode = (m) => {
    mode = m;
    form.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    form.querySelectorAll('[data-only]').forEach((el) => { el.hidden = el.dataset.only !== m; });
    form.password.autocomplete = m === 'register' ? 'new-password' : 'current-password';
    submit.textContent = m === 'register' ? 'Créer mon compte' : 'Entrer';
    error.textContent = '';
  };
  form.addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.name.value.trim(), password = form.password.value;
    if (!NAME_RULE.test(name)) { error.textContent = 'Pseudo : 3 à 16 caractères, lettres, chiffres, tiret ou tiret bas.'; return; }
    if (password.length < 8) { error.textContent = 'Mot de passe : 8 caractères au minimum.'; return; }
    if (mode === 'register' && password !== form.password2.value) { error.textContent = 'Les deux mots de passe sont différents.'; return; }
    const label = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'Un instant…';
    error.textContent = '';
    try {
      const key = await deriveKey(name, password);
      const data = await call('POST', mode === 'register' ? '/api/register' : '/api/login', { name, key });
      S.session = { token: data.token, name: data.player.name };
      saveSession(S.session);
      await loadGame();
      location.hash = '#/packs';
      shell();
      route();
      if (mode === 'register') {
        const packs = 1 + (S.free.spare || 0);
        toast('Bienvenue ' + S.player.name + ' ! ' + (packs > 1 ? packs + ' packs t\'attendent.' : 'Ton premier pack t\'attend.'));
      }
    } catch (err) {
      error.textContent = err instanceof ApiError ? err.message : 'Un problème est survenu. Réessaie.';
      if (!(err instanceof ApiError)) console.error(err);
      submit.disabled = false;
      submit.textContent = label;
    }
  });
  /* quelques-unes des meilleures cartes en éventail, pour donner envie (le catalogue est public) */
  loadCatalogue().then(() => {
    const fan = document.getElementById('fan');
    if (!fan || !S.cat) return;
    const picks = [];
    for (const role of ['TOP', 'JGL', 'MID', 'BOT', 'SUP']) {
      const c = S.cat.cards.find((x) => x.role === role && x.photo);
      if (c) picks.push(c);
    }
    fan.innerHTML = picks.map((c, i) => cardHTML(c, S.cat, { eager: true }).replace('<article class="', '<article style="--i:' + i + '" class="')).join('');
  }).catch(() => { /* pas grave : la page de connexion marche sans */ });
}

/* ---------- ossature et navigation ---------- */
function shell() {
  const pip = (id) => '<i class="pip" data-pip="' + id + '" hidden></i>';
  app.innerHTML = '<header class="top' + (S.live ? ' wide' : '') + '"><a class="brand" href="#/packs"><svg viewBox="0 0 100 100" aria-hidden="true"><use href="#mark"/></svg>' + esc(GAME_NAME) + '<small>saison ' + S.cat.season + '</small></a>'
    + '<nav class="nav">' + tabs().map((t) => '<a href="#/' + t[0] + '" data-tab="' + t[0] + '">' + t[1] + pip(t[0]) + '</a>').join('') + '</nav>'
    + '<span class="spacer"></span><a class="online" id="online" href="#/joueurs" hidden><i></i><b>1</b><span>en ligne</span></a>'
    + '<a class="purse" href="#/' + (S.live ? 'marche' : 'jouer') + '" title="Tes crédits : gagnés en jouant, dépensés au marché">' + icon('i-coin') + '<b id="credits">' + S.player.coins + '</b></a>'
    + '<a class="who" href="#/profil">' + icon('i-user') + '<b>' + esc(S.player.name) + '</b></a></header>'
    + '<main class="main" id="main"></main>'
    + '<nav class="tabs">' + tabs().map((t) => '<a href="#/' + t[0] + '" data-tab="' + t[0] + '">' + icon(t[2]) + t[1] + pip(t[0]) + '</a>').join('') + '</nav>';
  drawPulse();
}
/* ce que l'application prête aux autres écrans (Jouer, Marché, Joueurs, Mondial) */
const PLAY = {
  S, call, guard, toast, applyState, icon, now,
  refresh: () => route(),
  expired: () => { clearSession(); S.session = null; showAuth('Ta connexion a expiré. Reconnecte-toi.'); },
  /** Note ce que le serveur dit d'une carte de ma collection : qty exemplaires (0 : je ne l'ai plus). */
  owned: (id, qty) => { if (qty > 0) S.owned.set(id, { qty, at: (S.owned.get(id) || { at: now() }).at }); else S.owned.delete(id); },
  /** Redemande au serveur mes crédits et ma collection. */
  refreshMe: async () => { try { await loadCollection(); } catch (e) { /* on se remettra à jour au prochain passage */ } },
  pulse: () => pulse(),
};
const DUELS = createDuels(PLAY);
PLAY.duel = DUELS;
const VIEWS = {
  packs: viewPacks, collection: viewCollection, classement: viewBoard, profil: viewProfile,
  jouer: (main, sub) => (sub === 'mondial' && S.live ? viewWorlds(main, PLAY) : viewPlay(main, PLAY)),
  marche: (main) => viewMarket(main, PLAY),
  joueurs: (main) => viewSocial(main, PLAY),
};
function route() {
  if (!S.session || !S.cat || !$('#main') || S.busy) return;
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  let name = parts[0] || 'packs';
  /* le classement vit maintenant dans l'onglet Joueurs */
  if (S.live && name === 'classement') {
    S.social = Object.assign(S.social || { friends: null, trades: null, board: null, duels: null }, { tab: 'classement' });
    name = 'joueurs';
    history.replaceState(null, '', '#/joueurs');
  }
  const tab = tabs().some((t) => t[0] === name) && VIEWS[name] ? name : 'packs';
  document.querySelectorAll('[data-tab]').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  window.scrollTo(0, 0);
  VIEWS[tab]($('#main'), parts[1] || '');
}
window.addEventListener('hashchange', route);

/* ---------- carte cliquable ---------- */
function tile(card, extra) {
  const own = S.owned.get(card.id);
  return '<button class="tile" type="button" data-card="' + esc(card.id) + '" aria-label="' + esc(card.name) + ', note ' + card.ovr + '">'
    + cardHTML(card, S.cat, { cls: own ? '' : 'missing', qty: own ? own.qty : 0 }) + (extra || '') + '</button>';
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-card]');
  if (t && S.cat) showSheet(t.dataset.card);
});
/* ---------- écran Packs ---------- */
/* un pack peut s'ouvrir si le délai du pack gratuit est écoulé, ou s'il reste des packs en réserve */
const timeLeft = () => S.free.readyAt - now();
const packReady = () => timeLeft() <= 0 || S.free.spare > 0;
/* résumé de la situation : quand il change, on redessine le bouton ; sinon seul le compte à rebours bouge */
const packSig = () => (timeLeft() <= 0 ? 'pret' : 'attente') + '/' + (S.free.spare || 0);
function progressHTML() {
  const total = S.cat.cards.length, have = S.owned.size;
  const tally = (all) => all.filter((c) => S.owned.has(c.id)).length + '/' + all.length;
  const tiers = [...S.cat.tiers].reverse().map((t) => '<span style="--tc:var(--t' + t.id + ')"><i></i>' + esc(t.name) + ' ' + tally(S.cat.base.filter((c) => c.tier === t.id)) + '</span>').join('')
    + Object.entries(VARIANTS).filter(([id]) => S.cat.cards.some((c) => c.variant === id)).map(([id, v]) => '<span class="v-' + id + '"><i></i>' + v.name + (id === 'holo' ? 's' : '') + ' ' + tally(S.cat.cards.filter((c) => c.variant === id)) + '</span>').join('');
  return '<div class="meter"><div class="meter-head"><span class="label">Collection</span><span><b>' + have + '</b> / ' + total + ' cartes</span></div>'
    + '<div class="bar"><i style="width:' + pct(have, total) + '%"></i></div><div class="tiers">' + tiers + '</div></div>';
}
function packActionHTML() {
  const left = timeLeft(), spare = S.free.spare || 0;
  if (left > 0 && !spare) {
    return '<div class="wait"><div class="wait-time"><b id="count">' + clock(left) + '</b><span>avant le prochain pack</span></div>'
      + '<div class="bar"><i id="countBar" style="width:' + Math.min(100, 100 - (100 * left) / S.free.cooldownMs) + '%"></i></div></div>';
  }
  const reserve = spare ? '<p class="reserve"><b>' + spare + '</b> pack' + (spare > 1 ? 's' : '') + ' en réserve'
    + (left > 0 ? ' · prochain pack gratuit dans <b id="count">' + clock(left) + '</b>' : '') + '</p>' : '';
  return '<button class="btn primary big" type="button" id="openPack">' + (left > 0 ? 'Ouvrir un pack en réserve' : 'Ouvrir le pack') + '</button>' + reserve;
}
function viewPacks(main) {
  const recent = [...S.owned.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, 6).map(([id]) => S.cat.cardById.get(id)).filter(Boolean);
  main.innerHTML = '<section class="home"><div class="home-pack" id="packBox">' + packHTML(packReady() ? 'ready' : 'waiting', S.cat.season, S.free.size) + '</div>'
    + '<div class="home-side"><div class="eyebrow">Pack gratuit · toutes les ' + Math.round(S.free.cooldownMs / 60000) + ' minutes</div>'
    + '<h1 class="h1">' + S.free.size + ' cartes à découvrir</h1>'
    + '<p class="lead">Joueurs et coachs pros de la saison ' + S.cat.season + '. La dernière carte du pack est une carte bonus : rang Titulaire au minimum. Les plus belles cartes existent aussi en version holographique et en full art' + (S.cat.cards.some((c) => c.variant === 'kc') ? ', et les joueurs passés par la Karmine en édition KC' : '') + '.</p>'
    + '<div id="packAction" data-sig="' + packSig() + '">' + packActionHTML() + '</div>' + progressHTML() + '</div></section>'
    + '<section><h2 class="h2">Dernières cartes obtenues</h2>'
    + (recent.length ? '<div class="row-cards">' + recent.map((c) => tile(c)).join('') + '</div>' : '<p class="empty">Ta collection est vide. Ouvre ton premier pack !</p>')
    + '</section>';
}
/* compte à rebours : mis à jour chaque seconde, sans redessiner l'écran */
setInterval(() => {
  const box = document.getElementById('packAction');
  if (!box || !S.free || S.opening) return;
  if (box.dataset.sig !== packSig()) {
    box.dataset.sig = packSig();
    box.innerHTML = packActionHTML();
    const pack = $('#packBox .pack');
    if (pack) pack.className = 'pack ' + (packReady() ? 'ready' : 'waiting');
    return;
  }
  const left = timeLeft(), count = document.getElementById('count'), bar = document.getElementById('countBar');
  if (count) count.textContent = clock(left);
  if (bar) bar.style.width = Math.min(100, 100 - (100 * left) / S.free.cooldownMs) + '%';
}, 1000);
document.addEventListener('click', async (e) => {
  if (!e.target.closest('#openPack') || S.opening) return;
  S.opening = true;
  try {
    const result = await runOpening({
      request: async () => {
        const data = await call('POST', '/api/packs/free');
        /* le serveur vient d'être mis à jour avec de nouvelles cartes : on recharge le catalogue avant de les montrer */
        if (data.catalogVersion && data.catalogVersion !== S.cat.version) await loadCatalogue(data.catalogVersion);
        return data;
      },
      getCat: () => S.cat, fx: S.fx, size: S.free.size, from: $('#packBox .pack'),
    });
    applyState(result.data);
    for (const p of result.data.pack.cards) {
      const had = S.owned.get(p.id);
      S.owned.set(p.id, { qty: p.qty, at: had ? had.at : now() });
    }
    S.opening = false;
    if (result.goTo === 'collection') { S.filters.sort = 'recent'; S.filters.own = 'owned'; location.hash = '#/collection'; }
    else route();
  } catch (err) {
    S.opening = false;
    if (err instanceof ApiError && err.code === 'pas_pret') { applyState({ free: err.data.free, skew: err.data.skew }); toast(err.message, true); route(); }
    else if (err instanceof ApiError && err.status === 401) { clearSession(); S.session = null; showAuth('Ta connexion a expiré. Reconnecte-toi.'); }
    else { toast(err instanceof ApiError ? err.message : 'Un problème est survenu.', true); if (!(err instanceof ApiError)) console.error(err); }
  }
});

/* ---------- écran Collection ---------- */
function filteredCards() {
  const f = S.filters, q = f.q.trim().toLowerCase();
  const list = S.cat.cards.filter((c) => {
    const own = S.owned.has(c.id);
    if (f.own === 'owned' && !own) return false;
    if (f.own === 'missing' && own) return false;
    if (f.league && c.league !== f.league) return false;
    if (f.team && c.team !== f.team) return false;
    if (f.role && c.role !== f.role) return false;
    if (f.tier && c.tier !== Number(f.tier)) return false;
    if (f.variant && (c.variant || 'base') !== f.variant) return false;
    if (q) {
      const team = S.cat.teamById.get(c.team);
      if (!(c.name.toLowerCase().includes(q) || (team && (team.name.toLowerCase().includes(q) || team.short.toLowerCase() === q)))) return false;
    }
    return true;
  });
  const at = (c) => (S.owned.get(c.id) || { at: 0 }).at;
  const qty = (c) => (S.owned.get(c.id) || { qty: 0 }).qty;
  const sorts = {
    ovr: (a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name) || variantRank(a) - variantRank(b),
    name: (a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }) || variantRank(a) - variantRank(b),
    recent: (a, b) => at(b) - at(a) || b.ovr - a.ovr,
    qty: (a, b) => qty(b) - qty(a) || b.ovr - a.ovr,
    team: (a, b) => a.league.localeCompare(b.league) || a.team.localeCompare(b.team) || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || b.ovr - a.ovr || a.name.localeCompare(b.name) || variantRank(a) - variantRank(b),
  };
  return list.sort(sorts[f.sort] || sorts.ovr);
}
/* Le classeur rangé par roster : une page par équipe, ses joueurs dans l'ordre des postes puis son coach.
   L'avancement d'un roster compte toutes ses cartes, même celles que les filtres cachent. */
function rosterGroups(list) {
  const cat = S.cat, shown = new Map();
  for (const c of list) { const g = shown.get(c.team); if (g) g.push(c); else shown.set(c.team, [c]); }
  const byRole = (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || b.ovr - a.ovr || a.name.localeCompare(b.name) || variantRank(a) - variantRank(b);
  const groups = [];
  for (const [id, cards] of shown) {
    const team = cat.teamById.get(id) || { id, name: id, short: id, league: cards[0].league };
    const all = cat.base.filter((c) => c.team === id), special = cat.cards.filter((c) => c.variant && c.team === id);
    /* note du roster : le meilleur joueur de chaque poste */
    const best = ['TOP', 'JGL', 'MID', 'BOT', 'SUP'].map((r) => Math.max(0, ...all.filter((c) => c.role === r).map((c) => c.ovr))).filter(Boolean);
    groups.push({
      team, cards: cards.sort(byRole), total: all.length, have: all.filter((c) => S.owned.has(c.id)).length,
      special: special.length, haveSpecial: special.filter((c) => S.owned.has(c.id)).length,
      rating: best.length ? Math.round(best.reduce((a, b) => a + b, 0) / best.length) : 0,
    });
  }
  const leagueRank = (g) => { const i = cat.leagues.findIndex((l) => l.id === g.team.league); return i < 0 ? 99 : i; };
  const byName = (a, b) => a.team.name.localeCompare(b.team.name, 'fr', { sensitivity: 'base' });
  const orders = {
    league: (a, b) => leagueRank(a) - leagueRank(b) || byName(a, b),
    done: (a, b) => b.have / b.total - a.have / a.total || b.have - a.have || b.haveSpecial - a.haveSpecial || byName(a, b),
    rating: (a, b) => b.rating - a.rating || byName(a, b),
  };
  return groups.sort(orders[S.filters.rsort] || orders.league);
}
function rostersHTML(groups) {
  const cat = S.cat, byLeague = S.filters.rsort === 'league';
  let html = '', league = null;
  for (const g of groups) {
    if (byLeague && g.team.league !== league) {
      league = g.team.league;
      const info = cat.leagues.find((l) => l.id === league), mine = groups.filter((x) => x.team.league === league);
      const full = mine.filter((x) => x.have === x.total).length;
      html += '<h2 class="h2 ros-league">' + esc(info ? info.name : league) + '<small>' + (info ? esc(info.region) + ' · ' : '') + (full ? full + (full > 1 ? ' rosters complets' : ' roster complet') : mine.reduce((sum, x) => sum + x.have, 0) + ' cartes') + '</small></h2>';
    }
    const done = g.have === g.total;
    html += '<details class="ros' + (done ? ' done' : '') + '" open data-team="' + esc(g.team.id) + '"><summary class="ros-head">'
      + '<span class="ros-name"><b>' + esc(g.team.name) + '</b>' + (done ? '<u>Complet</u>' : '') + '<i>' + esc(g.team.league) + ' · note ' + g.rating + '</i></span>'
      + '<span class="ros-meter"><span><b>' + g.have + '</b> / ' + g.total + '</span>'
      + (g.special ? '<em title="Versions spéciales">' + g.haveSpecial + ' / ' + g.special + '</em>' : '')
      + '<span class="bar"><i style="width:' + pct(g.have, g.total) + '%"></i></span></span></summary>'
      + '<div class="grid">' + g.cards.map((c) => tile(c)).join('') + '</div></details>';
  }
  return html;
}
function drawGrid() {
  const grid = document.getElementById('grid');
  if (!grid) return;
  const list = filteredCards(), roster = S.filters.group === 'roster';
  const groups = roster ? rosterGroups(list) : [];
  $('#gridCount').textContent = list.length + (list.length > 1 ? ' cartes affichées' : ' carte affichée') + ' · ' + list.filter((c) => S.owned.has(c.id)).length + ' possédées'
    + (roster && groups.length ? ' · ' + groups.length + (groups.length > 1 ? ' rosters' : ' roster') : '');
  grid.className = roster ? 'rosters' : 'grid';
  grid.innerHTML = !list.length ? '' : roster ? rostersHTML(groups) : list.map((c) => tile(c)).join('');
  $('#gridEmpty').hidden = list.length > 0;
}
function viewCollection(main) {
  const f = S.filters, cat = S.cat;
  /* première visite : on montre d'abord ce que le joueur possède, l'album complet est à un clic */
  if (!f.own) f.own = S.owned.size ? 'owned' : 'all';
  const option = (value, text, current) => '<option value="' + esc(value) + '"' + (String(current) === String(value) ? ' selected' : '') + '>' + esc(text) + '</option>';
  const teams = cat.teams.filter((t) => !f.league || t.league === f.league);
  if (f.team && !teams.some((t) => t.id === f.team)) f.team = '';
  main.innerHTML = '<div class="col-head"><div><h1 class="h1">Collection</h1><p>' + S.owned.size + ' cartes sur ' + cat.cards.length + ' · ' + S.player.cardsTotal + ' exemplaires en tout</p></div></div>'
    + '<div class="filters">'
    + '<input class="inp" id="fq" type="search" placeholder="Joueur ou équipe…" value="' + esc(f.q) + '" autocomplete="off">'
    /* sur téléphone, les listes de filtres se replient derrière ce bouton */
    + '<button class="btn filters-toggle' + (S.filtersOpen ? ' on' : '') + '" type="button" id="fmore" aria-expanded="' + !!S.filtersOpen + '">Filtres</button>'
    + '<div class="filters-more' + (S.filtersOpen ? ' open' : '') + '" id="fbox">'
    + '<select class="sel" data-f="league" aria-label="Ligue">' + option('', 'Toutes les ligues', f.league) + cat.leagues.map((l) => option(l.id, l.name, f.league)).join('') + '</select>'
    + '<select class="sel" data-f="team" aria-label="Équipe">' + option('', 'Toutes les équipes', f.team) + teams.map((t) => option(t.id, t.name, f.team)).join('') + '</select>'
    + '<select class="sel" data-f="role" aria-label="Poste">' + option('', 'Tous les postes', f.role) + ROLE_ORDER.map((r) => option(r, ROLE_NAME[r], f.role)).join('') + '</select>'
    + '<select class="sel" data-f="tier" aria-label="Rang">' + option('', 'Tous les rangs', f.tier) + [...cat.tiers].reverse().map((t) => option(t.id, t.name, f.tier)).join('') + '</select>'
    + '<select class="sel" data-f="variant" aria-label="Version">' + option('', 'Toutes les versions', f.variant) + option('base', 'Ordinaires', f.variant) + Object.entries(VARIANTS).map(([id, v]) => option(id, v.name + (id === 'holo' ? 's' : ''), f.variant)).join('') + '</select>'
    /* par roster, les cartes d'une équipe suivent l'ordre des postes : la liste de tri range alors les rosters entre eux */
    + (f.group === 'roster'
      ? '<select class="sel" data-f="rsort" aria-label="Ordre des rosters">' + [['league', 'Rosters : par ligue'], ['done', 'Rosters : les plus complets'], ['rating', 'Rosters : les mieux notés']].map((s) => option(s[0], s[1], f.rsort)).join('') + '</select>'
      : '<select class="sel" data-f="sort" aria-label="Tri">' + [['ovr', 'Tri : note'], ['name', 'Tri : nom'], ['team', 'Tri : équipe'], ['recent', 'Tri : récentes'], ['qty', 'Tri : exemplaires']].map((s) => option(s[0], s[1], f.sort)).join('') + '</select>')
    + '</div></div><div class="filters-row"><div class="seg" id="fown">'
    + [['all', 'Toutes'], ['owned', 'Possédées'], ['missing', 'Manquantes']].map((o) => '<button type="button" data-own="' + o[0] + '"' + (f.own === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>').join('')
    + '</div><div class="seg small" id="fgroup" role="group" aria-label="Rangement du classeur">'
    + [['', 'À la suite'], ['roster', 'Par roster']].map((o) => '<button type="button" data-group="' + o[0] + '"' + (f.group === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>').join('')
    + '</div><span class="count" id="gridCount"></span></div>'
    + '<div class="grid" id="grid"></div><p class="empty" id="gridEmpty" hidden>Aucune carte ne correspond à ces filtres.</p>';
  drawGrid();
  let typing = 0;
  $('#fq').addEventListener('input', (e) => { f.q = e.target.value; clearTimeout(typing); typing = setTimeout(drawGrid, 140); });
  $('#fmore').addEventListener('click', (e) => {
    S.filtersOpen = !S.filtersOpen;
    e.currentTarget.classList.toggle('on', S.filtersOpen);
    e.currentTarget.setAttribute('aria-expanded', String(S.filtersOpen));
    $('#fbox').classList.toggle('open', S.filtersOpen);
  });
  const keepGroup = () => { try { localStorage.setItem(STORE + 'classeur', f.group + '/' + f.rsort); } catch (e) { /* réglage non gardé */ } };
  main.querySelectorAll('[data-f]').forEach((sel) => sel.addEventListener('change', () => {
    f[sel.dataset.f] = sel.value;
    if (sel.dataset.f === 'rsort') keepGroup();
    if (sel.dataset.f === 'league') viewCollection(main); else drawGrid();
  }));
  $('#fgroup').addEventListener('click', (e) => {
    const b = e.target.closest('[data-group]');
    if (!b || b.dataset.group === f.group) return;
    f.group = b.dataset.group;
    keepGroup();
    viewCollection(main);
  });
  $('#fown').addEventListener('click', (e) => {
    const b = e.target.closest('[data-own]');
    if (!b) return;
    f.own = b.dataset.own;
    $('#fown').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    drawGrid();
  });
}

/* ---------- fiche d'une carte ---------- */
function showSheet(id) {
  const cat = S.cat, card = cat.cardById.get(id);
  if (!card) return;
  const own = S.owned.get(id), team = cat.teamById.get(card.team), tier = cat.tierById.get(card.tier);
  const league = cat.leagues.find((l) => l.id === card.league);
  const real = card.real || {};
  const fact = (value, text) => '<div><b>' + value + '</b><span>' + text + '</span></div>';
  let facts = '';
  if (card.kind === 'p' && real.g) {
    facts = fact(real.g, 'parties') + fact(pct(real.w, real.g) + ' %', 'victoires') + fact(frNum(real.k) + ' / ' + frNum(real.d) + ' / ' + frNum(real.a), 'K / D / A par partie') + fact(frNum(real.kda), 'KDA')
      + fact(real.kp + ' %', 'participation') + fact(real.dpm, 'dégâts / min') + fact(frNum(real.cspm), 'sbires / min') + fact(frNum(real.vspm), 'vision / min');
  } else if (card.kind === 'c' && real.g) {
    facts = fact(real.g, 'parties') + fact(pct(real.w, real.g) + ' %', 'victoires') + fact(real.w, 'gagnées') + fact(real.g - real.w, 'perdues');
  }
  const titles = card.titles ? [[card.titles[0], 'Worlds'], [card.titles[1], 'MSI'], [card.titles[2], 'autre titre international']].filter((t) => t[0])
    .map((t) => '<span class="chip" style="--tc:var(--t3)">' + t[0] + ' × ' + t[1] + '</span>').join('') : '';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = '<div class="sheet-box panel" role="dialog" aria-modal="true" aria-label="' + esc(card.name) + '" style="--tc:var(--t' + card.tier + ')">'
    + '<div class="sheet-card">' + cardHTML(card, cat, { eager: true, cls: own ? '' : 'missing', qty: own ? own.qty : 0 })
    + '<span>' + (own ? (own.qty > 1 ? own.qty + ' exemplaires' : '1 exemplaire') + ' · depuis le ' + frDate(own.at) : 'Carte manquante') + '</span></div>'
    + '<div class="sheet-info"><div class="sheet-title"><div><h2>' + esc(card.name) + '</h2>'
    + '<p>' + (card.country ? '<img src="' + flagUrl(card.country) + '" alt="">' + esc(cat.countries[card.country]) + ' · ' : '') + esc(ROLE_NAME[card.role]) + ' · ' + esc(team ? team.name : card.team) + '</p></div>'
    + '<span class="spacer"></span><button class="close" type="button" aria-label="Fermer">' + icon('i-close') + '</button></div>'
    + '<div class="chips"><span class="chip">' + esc(tier.name) + ' · ' + card.ovr + '</span>' + (card.variant ? '<span class="chip v-' + card.variant + '">' + VARIANTS[card.variant].name + '</span>' : '') + '<span class="chip" style="--tc:var(--mut)">' + esc(card.league) + (league ? ' · ' + esc(league.region) : '') + '</span>' + titles + '</div>'
    + '<div><h3 class="h2">Statistiques de la carte</h3><div class="bars">' + statsOf(card).map((s) => '<div title="' + esc(s[3]) + '"><span>' + s[2] + '</span><span class="bar"><i style="width:' + card.stats[s[0]] + '%"></i></span><b>' + card.stats[s[0]] + '</b></div>').join('') + '</div></div>'
    + (facts ? '<div><h3 class="h2">Saison ' + cat.season + (card.kind === 'c' ? ' de son équipe' : ' en chiffres') + '</h3><div class="facts">' + facts + '</div></div>' : '<p class="note">Aucune partie officielle jouée cette saison : la note est celle d\'un remplaçant.</p>')
    + (card.champs && card.champs.length ? '<div><h3 class="h2">Champions fétiches</h3><div class="champs">' + card.champs.map((c) => '<div class="champ"><img src="' + iconUrl(cat, c[0]) + '" alt="" loading="lazy"><div><b>' + esc(champName(cat, c[0])) + '</b><span>' + c[1] + ' parties · ' + pct(c[2], c[1]) + ' %</span></div></div>').join('') + '</div></div>' : '')
    + (card.variant ? '<p class="note">' + (card.variant === 'kc' ? 'Édition Karmine Corp de la carte de ' + esc(card.name) + ' (' + esc(karmineEra(cat, card)) + '), réservée à celles et ceux qui portent ou ont porté ses couleurs'
      : 'Version ' + (card.variant === 'holo' ? 'holographique' : 'full art') + ' de la carte de ' + esc(card.name)) + ' : même joueur, même note, un autre habillage. Elle sort parfois d\'un pack à la place de la carte ordinaire, et se collectionne à part.</p>' : '')
    + '<p class="note">Note calculée à partir des statistiques officielles de la saison ' + cat.season + ' (ligue, tournois internationaux, palmarès). Données : Leaguepedia.</p>'
    /* le marché : vendre un exemplaire, ou chercher qui vend cette carte */
    + (S.live && !S.busy && !S.opening ? '<div class="actions sheet-acts">' + (own ? '<button class="btn" type="button" data-sheet="sell">Vendre un exemplaire</button>' : '')
      + '<button class="btn" type="button" data-sheet="market">' + (own ? 'Voir sur le marché' : 'La chercher au marché') + '</button></div>' : '')
    + '</div></div>';
  const close = () => { sheet.remove(); document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('.close')) { close(); return; }
    const act = e.target.closest('[data-sheet]');
    if (!act) return;
    close();
    /* les fenêtres ouvertes derrière (échange, marché) se referment : on change d'écran */
    document.querySelectorAll('.sheet').forEach((el) => { const x = el.querySelector('.close'); if (x) x.click(); });
    if (act.dataset.sheet === 'sell') sellCard(id, PLAY); else showOnMarket(card.base || card.id, PLAY);
  });
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(sheet);
  /* la carte s'incline sous le doigt ou la souris ; les reflets d'une version spéciale suivent le geste */
  if (S.fx && own) tiltCard($('.sheet-card .card', sheet), 22);
}

/* ---------- écran Classement ---------- */
async function viewBoard(main) {
  main.innerHTML = '<div class="col-head"><div><h1 class="h1">Classement</h1><p>Les plus grandes collections, et les victoires de chacun.</p></div></div><div id="board"><div class="center" style="min-height:30dvh"><div class="spin"></div></div></div>';
  const data = await guard(() => call('GET', '/api/leaderboard'));
  const box = document.getElementById('board');
  if (!data || !box) return;
  box.innerHTML = '<table class="board"><thead><tr><th>#</th><th>Joueur</th><th class="num">Cartes</th><th class="num">Victoires</th><th class="num hide-s">Défaites</th><th class="num hide-s">Packs</th></tr></thead><tbody>'
    + data.top.map((p, i) => '<tr' + (p.id === data.me ? ' class="me"' : '') + '><td>' + (i + 1) + '</td><td><b>' + esc(p.name) + '</b></td>'
      + '<td class="num">' + p.cardsUnique + ' / ' + data.totalCards + '</td><td class="num">' + p.wins + '</td><td class="num hide-s">' + p.losses + '</td><td class="num hide-s">' + p.packsOpened + '</td></tr>').join('')
    + '</tbody></table>';
}

/* ---------- écran Profil ---------- */
async function viewProfile(main) {
  const p = S.player;
  main.innerHTML = '<div class="col-head"><div><h1 class="h1">' + esc(p.name) + '</h1><p>Joueur depuis le ' + frDate(p.createdAt) + '</p></div></div><div class="panels">'
    + '<section class="panel"><h3>Mon compte</h3><div class="kv"><span>Packs ouverts</span><b>' + p.packsOpened + '</b><span>Cartes différentes</span><b>' + p.cardsUnique + ' / ' + S.cat.cards.length + '</b><span>Exemplaires</span><b>' + p.cardsTotal + '</b><span>Parties gagnées</span><b>' + p.wins + ' sur ' + (p.wins + p.losses) + '</b>'
    + (S.live ? '<span>Défis entre joueurs</span><b>' + (p.duelWins || 0) + ' V – ' + (p.duelLosses || 0) + ' D</b><span>Mondiaux remportés</span><b>' + (p.titles || 0) + '</b>' : '')
    + '<span>Crédits</span><b>' + p.coins + '</b></div>'
    + '<div class="switch"><span>Animations</span><button type="button" id="fxSwitch" aria-pressed="' + S.fx + '" aria-label="Animations"></button></div>'
    + '<div class="switch"><span>Sons</span><button type="button" id="soundSwitch" aria-pressed="' + soundOn() + '" aria-label="Sons"></button></div>'
    + '<div class="actions"><button class="btn" type="button" id="logout">Se déconnecter</button><button class="btn danger" type="button" id="askDelete">Supprimer mon compte</button></div>'
    + '<form id="deleteForm" hidden style="display:grid;gap:10px"><p class="hint">Ton compte et toutes tes cartes seront effacés pour de bon. Tape ton mot de passe pour confirmer.</p>'
    + '<input class="inp" name="password" type="password" autocomplete="current-password" placeholder="Mot de passe" required><p class="form-error" role="alert"></p>'
    + '<div class="actions"><button class="btn danger" type="submit">Effacer définitivement</button><button class="btn" type="button" id="cancelDelete">Annuler</button></div></form></section>'
    + '<section class="panel"><h3>Chances du pack gratuit</h3><div id="odds"><p class="hint">Chargement…</p></div></section>'
    + '<section class="panel"><h3>À propos</h3>'
    + '<p class="hint">' + esc(GAME_NAME) + ' est un projet de fan gratuit de Bcorps Labs. Les cartes représentent les joueurs et coachs en activité dans les ligues majeures (LCK, LPL, LEC, LCS, LCP, CBLOL), saison ' + S.cat.season + '. Catalogue du ' + frDate(Date.parse(S.cat.generated)) + '.</p>'
    + '<p class="hint">Effectifs, statistiques et palmarès : <a href="https://lol.fandom.com/" target="_blank" rel="noopener">Leaguepedia</a>, licence CC BY-SA 3.0. Photos des joueurs : portraits officiels des équipes et des ligues, affichés depuis Leaguepedia. Images des champions : Riot Games (Data Dragon). Drapeaux : flag-icons (licence MIT).</p>'
    + '<p class="hint">' + esc(GAME_NAME) + ' was created under Riot Games\' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project. Ce jeu n\'est ni approuvé ni sponsorisé par Riot Games, ni par les équipes et les joueurs cités.</p>'
    + '<div class="actions"><a class="btn" href="../../">Retour à Bcorps Labs</a></div></section></div>';

  $('#fxSwitch').addEventListener('click', (e) => {
    S.fx = !S.fx;
    e.currentTarget.setAttribute('aria-pressed', String(S.fx));
    document.body.classList.toggle('fx', S.fx);
    try { localStorage.setItem(STORE + 'fx', S.fx ? '1' : '0'); } catch (err) { /* réglage non gardé */ }
  });
  $('#soundSwitch').addEventListener('click', (e) => {
    setSound(!soundOn());
    e.currentTarget.setAttribute('aria-pressed', String(soundOn()));
    sfx.click();
  });
  $('#logout').addEventListener('click', async () => {
    try { await call('POST', '/api/logout'); } catch (err) { /* la connexion sera de toute façon oubliée ici */ }
    clearSession();
    S.session = null;
    showAuth();
  });
  const form = $('#deleteForm');
  $('#askDelete').addEventListener('click', () => { form.hidden = false; form.password.focus(); });
  $('#cancelDelete').addEventListener('click', () => { form.hidden = true; form.reset(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('.form-error', form);
    error.textContent = '';
    try {
      const key = await deriveKey(S.player.name, form.password.value);
      await call('POST', '/api/account/delete', { key });
      clearSession();
      S.session = null;
      showAuth('Ton compte a été supprimé.');
    } catch (err) {
      error.textContent = err instanceof ApiError ? err.message : 'Un problème est survenu.';
    }
  });

  const data = await guard(() => call('GET', '/api/packs'));
  const box = document.getElementById('odds');
  if (!data || !box) return;
  const pack = data.packs[0], show = (x) => (x ? frNum(Math.round(1000 * x) / 10) + ' %' : '—');
  box.innerHTML = '<table class="odds"><thead><tr><th>Rang</th><th>Cartes 1 à ' + (pack.size - 1) + '</th><th>Carte bonus</th></tr></thead><tbody>'
    + [...S.cat.tiers].reverse().map((t) => '<tr style="--tc:var(--t' + t.id + ')"><td>' + esc(t.name) + '</td><td>' + show(pack.odds[t.id - 1]) + '</td><td>' + show(pack.lastOdds[t.id - 1]) + '</td></tr>').join('')
    + '</tbody></table>'
    + (data.variants || []).map((v) => {
      const from = S.cat.tiers.filter((t) => t.id >= v.minTier).map((t) => t.name);
      /* l'édition KC ne dépend pas du rang : elle concerne les joueurs et les coachs passés par la Karmine */
      if (v.id === 'kc') return '<p class="hint"><b class="v-kc">' + esc(v.name) + '</b> — ' + show(v.chance) + ' des cartes des joueurs et des coachs passés par la Karmine Corp (' + v.cards + ' cartes) sortent dans cette édition.</p>';
      return '<p class="hint"><b class="v-' + esc(v.id) + '">' + esc(v.name) + '</b> — ' + show(v.chance) + ' des cartes ' + esc(from.slice(0, -1).join(', ') + (from.length > 1 ? ' et ' : '') + from[from.length - 1]) + ' sortent dans cette version.</p>';
    }).join('')
    + '<p class="hint">Les cartes sont tirées au sort par le serveur. Un coach sort moins souvent qu\'un joueur.</p>';
}

boot();
