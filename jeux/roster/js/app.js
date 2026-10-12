/* Roster — le jeu. Six écrans : Packs, Jouer (matchs, Mondial), Collection, Marché, Joueurs (amis, échanges, défis, classement), Profil.
   Le serveur décide de tout (cartes tirées, délais, collection, matchs, ventes, échanges) ; cette page affiche et met en scène. */
import { ApiError, call, clearSession, deriveKey, loadSession, saveSession } from './api.js';
import { VARIANTS, cardHTML, champName, esc, flagUrl, iconUrl, karmineEra, logoHTML, photoUrl, prepare, statsOf, tiltCard, variantRank } from './cards.js';
import { GAME_NAME, ROLE_LABEL, ROLE_NAME, ROLE_ORDER, STORE } from './config.js';
import { dailyLook, drawDaily, loadDaily } from './daily.js';
import { createDuels } from './duel.js';
import { sellCard, showOnMarket, viewMarket } from './market.js';
import { packHTML, runOpening } from './opening.js';
import { musicOn, startMusic } from './music.js';
import { viewPlay } from './play.js';
import { viewSocial } from './social.js';
import { sfx } from './sound.js';
import { toggleVolume } from './volume.js';
import { inspectCard } from './inspect.js';
import { confirmSheet, num } from './ui.js';
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
  shop: null,             // booster à crédits et barème de la vente rapide (null : le serveur ne les propose pas)
  pack: 'free',           // booster choisi sur l'écran Packs : 'free' ou 'credits'
  missions: null,         // les missions du jour (false : le serveur ne les connaît pas)
  daily: null,            // le « Champion du jour » : mon tableau du jour (false : le serveur ne connaît pas ce jeu)
  dailyOn: false,         // le serveur annonce des boosters du jour : le « Champion du jour » est proposé
  dailyPool: null,        // la liste des champions pour la saisie, et le nom des régions
  skew: 0,                // heure du serveur − heure de cet appareil
  cat: null,              // catalogue des cartes
  owned: new Map(),       // identifiant de carte → { qty, at }
  prints: new Map(),      // carte en édition limitée → numéros de mes exemplaires
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
  /* le booster à crédits et la vente rapide (un serveur plus ancien ne les annonce pas : le jeu ne les propose alors pas) */
  if (data.shop) S.shop = data.shop;
  /* le « Champion du jour » et ses boosters (même remarque) */
  if (data.daily) { S.dailyOn = true; if (S.daily && S.daily.pack) S.daily.pack.count = data.daily.packs; }
  if (typeof data.skew === 'number') S.skew = data.skew;
}
/** Ce que rapporte la vente rapide d'un exemplaire de cette carte (c'est le serveur qui fixe le barème). */
function quickPrice(card) {
  const q = S.shop && S.shop.quick;
  return q ? Math.round((q.tier[card.tier] || 4) * (card.variant ? q.variant[card.variant] || 1 : 1)) : 0;
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
  /* mes exemplaires numérotés (éditions limitées) */
  S.prints = new Map();
  for (const [id, serial] of data.prints || []) { const list = S.prints.get(id); if (list) list.push(serial); else S.prints.set(id, [serial]); }
  return data;
}
/** Le numéro de mon exemplaire d'une carte en édition limitée (le plus petit si j'en ai plusieurs). */
const serialOf = (id) => (S.prints.get(id) || [])[0] || 0;
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
/* Le rythme du pouls suit le joueur : toutes les 20 secondes tant qu'il joue ; toutes les minutes après deux minutes sans rien toucher ;
   toutes les cinq minutes après dix. Un onglet laissé ouvert toute une journée ne pèse ainsi presque rien sur le serveur (dont l'offre
   gratuite compte les appels), et le premier geste relance le pouls aussitôt. Onglet caché : aucun appel. */
const IDLE_SLOW = 2 * 60000, IDLE_SLEEP = 10 * 60000, PULSE_SLOW = 60000, PULSE_SLEEP = 5 * 60000;
let lastActive = Date.now(), lastPulse = 0, pulseTimer = 0;
const pulseDelay = () => { const idle = Date.now() - lastActive; return idle >= IDLE_SLEEP ? PULSE_SLEEP : idle >= IDLE_SLOW ? PULSE_SLOW : PULSE_MS; };
function beat() {
  clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => { lastPulse = Date.now(); pulse().finally(beat); }, pulseDelay());
}
function awake() {
  const dozing = Date.now() - lastActive >= IDLE_SLOW;
  lastActive = Date.now();
  /* il revient après une absence : des nouvelles tout de suite (si le dernier pouls date), puis le rythme ordinaire */
  if (dozing) { if (Date.now() - lastPulse >= PULSE_MS) { lastPulse = Date.now(); pulse(); } beat(); }
}
for (const type of ['pointerdown', 'click', 'keydown', 'input', 'wheel', 'touchstart']) document.addEventListener(type, awake, { passive: true, capture: true });
beat();
document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastPulse = Date.now(); pulse(); beat(); } });
async function boot() {
  try { S.fx = localStorage.getItem(STORE + 'fx') !== '0'; } catch (e) { S.fx = true; }
  try { S.pack = localStorage.getItem(STORE + 'booster') === 'credits' ? 'credits' : 'free'; } catch (e) { S.pack = 'free'; }
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
      /* (un autre compte sur le même écran : rien de l'équipe ni des missions du précédent ne doit rester) */
      S.play = null; S.missions = null; hubAsked = false; S.daily = null; S.dailyOn = false;
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
    /* le son : ce bouton ouvre le réglage du volume (musique de fond, effets) ; il est barré quand la musique est coupée */
    + '<button class="tune' + (musicOn() ? '' : ' off') + '" type="button" id="tune" aria-haspopup="dialog" title="Réglage du son" aria-label="Régler le son : musique de fond et effets">' + icon('i-note') + '</button>'
    + '<a class="purse" href="#/' + (S.live ? 'marche' : 'jouer') + '" title="Tes crédits : gagnés en jouant, dépensés au marché">' + icon('i-coin') + '<b id="credits">' + S.player.coins + '</b></a>'
    /* le joueur : son initiale dans un losange, puis son pseudo */
    + '<a class="who" href="#/profil"><i class="who-av"><span>' + esc(S.player.name.charAt(0).toUpperCase()) + '</span></i><b>' + esc(S.player.name) + '</b></a></header>'
    + '<main class="main" id="main"></main>'
    + '<nav class="tabs">' + tabs().map((t) => '<a href="#/' + t[0] + '" data-tab="' + t[0] + '">' + icon(t[2]) + t[1] + pip(t[0]) + '</a>').join('') + '</nav>';
  drawPulse();
}
/* ce que l'application prête aux autres écrans (Jouer, Marché, Joueurs, Mondial) */
const PLAY = {
  S, call, guard, toast, applyState, icon, now, sfx,
  refresh: () => route(),
  expired: () => { clearSession(); S.session = null; showAuth('Ta connexion a expiré. Reconnecte-toi.'); },
  /** Note ce que le serveur dit d'une carte de ma collection : qty exemplaires (0 : je ne l'ai plus). */
  owned: (id, qty) => { if (qty > 0) S.owned.set(id, { qty, at: (S.owned.get(id) || { at: now() }).at }); else S.owned.delete(id); },
  /** Redemande au serveur mes crédits et ma collection. */
  refreshMe: async () => { try { await loadCollection(); } catch (e) { /* on se remettra à jour au prochain passage */ } },
  pulse: () => pulse(),
  /** Ouvre un booster du jour (from : le sachet d'où part l'ouverture). */
  openDaily: (from) => openBooster('daily', from),
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
  const main = $('#main'), show = () => { window.scrollTo(0, 0); VIEWS[tab](main, parts[1] || ''); };
  /* On change de page : l'ancienne s'efface, la nouvelle arrive du côté de son onglet, bloc après bloc. (Une page qui se redessine sur place
     — après un achat, une revente… — ne rejoue rien.) */
  const from = shownTab, order = tabs().map((t) => t[0]), mine = ++pageTurn;
  shownTab = tab;
  if (from !== null && from !== tab) sfx.page();
  if (!S.fx || from === tab) { main.classList.remove('page-out'); show(); return; }
  const enter = () => {
    main.classList.remove('page-out', 'page-in');
    show();
    void main.offsetWidth;
    main.classList.add('page-in');
    setTimeout(() => { if (mine === pageTurn) main.classList.remove('page-in'); }, 750);
  };
  main.style.setProperty('--dir', from === null ? 0 : order.indexOf(tab) > order.indexOf(from) ? 1 : -1);
  if (from === null) { enter(); return; }
  main.classList.remove('page-in');
  main.classList.add('page-out');
  setTimeout(() => { if (mine === pageTurn && $('#main') === main) enter(); }, 120);
}
let shownTab = null, pageTurn = 0;
window.addEventListener('hashchange', route);
/* la musique de fond part au premier geste du joueur (un navigateur ne laisse rien jouer avant) ; son bouton la coupe ou la remet */
for (const kind of ['pointerdown', 'keydown']) document.addEventListener(kind, () => startMusic(), { passive: true });
const syncTune = () => { const b = document.getElementById('tune'); if (b) b.classList.toggle('off', !musicOn()); };
/* les onglets d'une page (filtres, sous-menus) répondent d'un petit « toc » */
document.addEventListener('click', (e) => { if (e.target.closest('.seg button:not(.on)')) sfx.click(); });
document.addEventListener('click', (e) => {
  const b = e.target.closest('#tune');
  if (b) toggleVolume(b, syncTune);
});

/* ---------- carte cliquable ---------- */
function tile(card, extra) {
  const own = S.owned.get(card.id);
  return '<button class="tile" type="button" data-card="' + esc(card.id) + '" aria-label="' + esc(card.name) + ', note ' + card.ovr + '">'
    + cardHTML(card, S.cat, { cls: own ? '' : 'missing', qty: own ? own.qty : 0, serial: own ? serialOf(card.id) : 0 }) + (extra || '') + '</button>';
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-card]');
  if (t && S.cat) showSheet(t.dataset.card);
});
/* ---------- écran Packs ---------- */
/** L'habillage d'un sachet : sa sorte (ses couleurs), et l'illustration de son champion vedette — le plus joué par les pros cette saison pour
    le pack gratuit, le plus banni pour le booster à crédits (jamais le même). */
function packLook(kind) {
  const list = Object.entries(S.cat.champions || {});
  const top = (key, skip) => list.reduce((best, c) => (c[0] !== skip && (c[1][key] || 0) > (best ? best[1][key] || 0 : 0) ? c : best), null);
  const played = top('g'), banned = top('b', played ? played[0] : '');
  const star = kind === 'credits' ? banned || played : played;
  return { kind, art: star ? star[0] + '_0' : null };
}
/* le booster choisi : le pack gratuit, ou le booster à crédits (quand le serveur le propose) */
const packKind = () => (S.pack === 'credits' && S.shop ? 'credits' : 'free');
const packWait = () => (packKind() === 'credits' ? S.shop.credits.cooldownMs : S.free.cooldownMs);
/* le pack gratuit peut s'ouvrir si son délai est écoulé, ou s'il reste des packs en réserve ; le booster à crédits, si son délai est écoulé et qu'on peut le payer */
const timeLeft = () => (packKind() === 'credits' ? S.shop.credits.readyAt : S.free.readyAt) - now();
const packReady = () => (packKind() === 'credits' ? timeLeft() <= 0 && S.player.coins >= S.shop.credits.price : timeLeft() <= 0 || S.free.spare > 0);
/* résumé de la situation : quand il change, on redessine le bouton ; sinon seul le compte à rebours bouge */
const packSig = () => packKind() + '/' + (timeLeft() <= 0 ? 'pret' : 'attente') + '/' + (packKind() === 'credits' ? (S.player.coins >= S.shop.credits.price ? 'ok' : 'court') : S.free.spare || 0);
/* ---------- le tableau de bord de l'accueil : la collection, mon équipe, ma saison ---------- */
/** La collection : un anneau (la part des cartes possédées), puis une barre par rang et par version spéciale. */
function progressHTML() {
  const total = S.cat.cards.length, have = S.owned.size, R = 54, C = 2 * Math.PI * R;
  const row = (attrs, name, all) => {
    const n = all.filter((c) => S.owned.has(c.id)).length;
    return '<span' + attrs + '><i></i><em>' + name + '</em><u class="bar"><i style="width:' + pct(n, all.length) + '%"></i></u><b>' + n + '/' + all.length + '</b></span>';
  };
  const tiers = [...S.cat.tiers].reverse().map((t) => row(' style="--tc:var(--t' + t.id + ')"', esc(t.name), S.cat.base.filter((c) => c.tier === t.id))).join('')
    + Object.entries(VARIANTS).filter(([id]) => S.cat.cards.some((c) => c.variant === id)).map(([id, v]) => row(' class="v-' + id + '"', v.name + (id === 'holo' ? 's' : ''), S.cat.cards.filter((c) => c.variant === id))).join('');
  /* (les graduations de l'anneau : un trait tous les dixièmes) */
  const ticks = Array.from({ length: 10 }, (x, k) => { const a = (k / 10) * 2 * Math.PI; return 'M' + (60 + 46 * Math.cos(a)).toFixed(1) + ' ' + (60 + 46 * Math.sin(a)).toFixed(1) + 'L' + (60 + 49 * Math.cos(a)).toFixed(1) + ' ' + (60 + 49 * Math.sin(a)).toFixed(1); }).join('');
  return '<div class="meter"><div class="hub-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="rg-track" cx="60" cy="60" r="' + R + '"/><path class="rg-ticks" d="' + ticks + '"/>'
    + '<circle class="rg-fill" cx="60" cy="60" r="' + R + '" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - have / Math.max(1, total))).toFixed(1) + '"/></svg>'
    + '<div class="rg-in"><b>' + pct(have, total) + '<small>%</small></b><span>' + have + ' / ' + total + '</span></div></div>'
    + '<div class="tiers">' + tiers + '</div></div>';
}
/** Mon équipe : sa note, mes dernières parties, les six visages alignés. (Elle vient de l'écran Jouer : S.play.) */
function teamHubHTML() {
  const P = S.play;
  if (!P) return '<div class="hub-wait"><div class="spin"></div></div>';
  /* (le coach : dans l'équipe telle que le serveur la décrit, sinon dans la composition enregistrée) */
  const L = P.lineup, coachId = (L.coach && L.coach.id) || (P.deck && P.deck.coach) || null;
  const filled = L.players.filter((p) => p.id).length + (coachId ? 1 : 0);
  const face = (id, role) => {
    const c = id ? S.cat.cardById.get(id) : null;
    return '<span class="hub-face' + (c ? '' : ' empty') + '" title="' + (c ? esc(c.name) + ' · ' + c.ovr : 'Poste libre') + '">'
      + (c && c.photo ? '<img src="' + photoUrl(c, 96) + '" alt="" loading="lazy" decoding="async" draggable="false">' : '<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#silhouette"/></svg>')
      + '<i>' + ROLE_LABEL[role] + '</i></span>';
  };
  const last = (P.history || []).slice(0, 5);
  return '<div class="hub-rating"><b>' + L.rating + '</b><span>Note<br>d\'équipe</span>'
    + (last.length ? '<em class="hub-form" title="Tes dernières parties, de la plus récente à la plus ancienne">' + last.map((m) => '<i class="' + (m.won ? 'w' : 'l') + '">' + (m.won ? 'V' : 'D') + '</i>').join('') + '</em>' : '') + '</div>'
    + '<div class="hub-line">' + L.players.map((p) => face(p.id, p.role)).join('') + face(coachId, 'COACH') + '</div>'
    + '<a class="btn" href="#/jouer">' + (filled < 6 ? 'Composer mon équipe' : 'Jouer un match') + '</a>';
}
/** Ma saison : six chiffres. */
function seasonHubHTML() {
  const p = S.player, games = p.wins + p.losses;
  const cell = (value, label, cls) => '<div' + (cls ? ' class="' + cls + '"' : '') + '><b>' + value + '</b><span>' + label + '</span></div>';
  return '<div class="hub-stats">' + cell(p.wins, p.wins > 1 ? 'victoires' : 'victoire') + cell(p.losses, p.losses > 1 ? 'défaites' : 'défaite')
    + cell(games ? Math.round((100 * p.wins) / games) + ' %' : '—', 'de réussite') + cell(num(p.coins), 'crédits', 'gold')
    + cell(p.packsOpened, p.packsOpened > 1 ? 'packs ouverts' : 'pack ouvert')
    + (S.live ? cell(p.titles || 0, (p.titles || 0) > 1 ? 'Mondiaux' : 'Mondial', 'gold') : cell(p.cardsTotal, 'exemplaires')) + '</div>';
}
function hubHTML() {
  return '<section class="hub">'
    + '<article class="hub-card hub-col panel"><header><span class="label">Collection</span><a href="#/collection">Tout voir</a></header>' + progressHTML() + '</article>'
    + '<article class="hub-card panel"><header><span class="label">Mon équipe</span><a href="#/jouer">Composer</a></header><div class="hub-team" id="hubTeam" style="display:contents">' + teamHubHTML() + '</div></article>'
    + '<article class="hub-card panel"><header><span class="label">Ma saison</span><a href="#/profil">Profil</a></header>' + seasonHubHTML() + '</article></section>';
}
/** L'équipe n'est connue qu'après un passage par l'écran Jouer : sinon on la demande au serveur, une seule fois par visite. */
let hubAsked = false;
async function loadHubTeam() {
  if (S.play || hubAsked) return;
  hubAsked = true;
  let data = null;
  try { data = await call('GET', '/api/play'); } catch (e) { return; }
  if (S.play || !data) return;
  applyState(data);
  S.play = data;
  const box = document.getElementById('hubTeam');
  if (box) box.innerHTML = teamHubHTML();
}
function packActionHTML() {
  if (packKind() === 'credits') {
    const shop = S.shop.credits, wait = timeLeft(), missing = shop.price - S.player.coins;
    if (wait > 0) {
      return '<div class="wait"><div class="wait-time"><b id="count">' + clock(wait) + '</b><span>avant le prochain booster</span></div>'
        + '<div class="bar"><i id="countBar" style="width:' + Math.min(100, 100 - (100 * wait) / shop.cooldownMs) + '%"></i></div></div>';
    }
    if (missing > 0) return '<button class="btn primary big" type="button" disabled>Il te manque ' + missing + ' crédits</button><p class="reserve">Gagne des matchs, vends tes doublons : il en faut <b>' + shop.price + '</b>.</p>';
    return '<button class="btn primary big" type="button" id="openPack">Acheter et ouvrir · ' + shop.price + ' crédits</button><p class="reserve">Tu as <b>' + S.player.coins + '</b> crédits.</p>';
  }
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
  /* les missions avancent en jouant : on les redemande à chaque passage sur cet écran */
  loadMissions();
  loadHubTeam();
  const recent = [...S.owned.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, 6).map(([id]) => S.cat.cardById.get(id)).filter(Boolean);
  const kind = packKind(), credits = kind === 'credits';
  /* le menu des boosters : le pack gratuit, ou celui qui se paie en crédits */
  const menu = S.shop ? '<div class="seg pack-menu" id="packMenu"><button type="button" data-pack="free"' + (credits ? '' : ' class="on"') + '>Pack gratuit</button>'
    + '<button type="button" data-pack="credits"' + (credits ? ' class="on"' : '') + '>Booster · ' + S.shop.credits.price + ' crédits</button></div>' : '';
  main.innerHTML = '<section class="home"><div class="home-pack' + (credits ? ' credits' : '') + '" id="packBox">' + packHTML(packReady() ? 'ready' : 'waiting', S.cat.season, S.free.size, packLook(kind)) + '</div>'
    + '<div class="home-side">' + menu + '<div class="eyebrow">' + (credits ? 'Booster à crédits · un toutes les ' + Math.round(S.shop.credits.cooldownMs / 60000) + ' minutes' : 'Pack gratuit · toutes les ' + Math.round(S.free.cooldownMs / 60000) + ' minutes') + '</div>'
    + '<h1 class="h1">' + S.free.size + ' cartes ' + (credits ? 'de plus' : 'à découvrir') + '</h1>'
    + '<p class="lead">' + (credits ? 'Un booster en plus du pack gratuit, payé avec tes crédits. Ses chances sont un peu plus faibles que celles du pack gratuit (le détail est dans ton profil).'
      /* (sur un téléphone, seulement l'essentiel : le bouton doit tenir sur le premier écran) */
      : 'Joueurs et coachs pros de la saison ' + S.cat.season + '. La dernière carte du pack est une carte bonus<span class="hide-s"> : rang Titulaire au minimum. Les plus belles cartes existent aussi en version holographique et en full art' + (S.cat.cards.some((c) => c.variant === 'kc') ? ', et les joueurs passés par la Karmine en édition KC' : '') + '</span>.') + '</p>'
    + '<div id="packAction" data-sig="' + packSig() + '">' + packActionHTML() + '</div></div></section>'
    + '<div class="dg-teaser" id="dailyTeaser" hidden></div>'
    + hubHTML()
    + '<section class="missions" id="missions"' + (S.missions ? '' : ' hidden') + '>' + (S.missions ? missionsHTML() : '') + '</section>'
    + '<section><h2 class="h2">Dernières cartes obtenues</h2>'
    + (recent.length ? '<div class="row-cards">' + recent.map((c) => tile(c)).join('') + '</div>' : '<p class="empty">Ta collection est vide. Ouvre ton premier pack !</p>')
    + '</section>'
    /* tout en bas : le champion du jour (affiché d'après ce qu'on sait déjà, puis redemandé au serveur) */
    + '<section class="daily" id="daily" hidden></section>';
  drawDaily(PLAY);
  loadDaily(PLAY);
}
/* ---------- les missions du jour ---------- */
function missionsHTML() {
  const m = S.missions, left = Math.max(0, m.resetAt - now()), h = Math.floor(left / 3_600_000), min = Math.floor((left % 3_600_000) / 60000);
  const row = (x) => '<div class="ms' + (x.claimed ? ' claimed' : x.done ? ' done' : '') + '"><div class="ms-t"><b>' + esc(x.label) + '</b>'
    + '<span class="bar"><i style="width:' + Math.round((100 * x.progress) / x.goal) + '%"></i></span></div><em class="num">' + x.progress + ' / ' + x.goal + '</em>'
    + (x.claimed ? '<span class="ms-ok">+' + x.reward + ' touchés</span>' : '<button class="btn' + (x.done ? ' primary' : '') + '" type="button" data-claim="' + x.slot + '"' + (x.done ? '' : ' disabled') + '>+' + x.reward + ' crédits</button>') + '</div>';
  return '<h2 class="h2">Missions du jour</h2><p class="ms-sub">De nouvelles missions dans ' + (h ? h + ' h ' : '') + min + ' min.</p><div class="ms-list">' + m.missions.map(row).join('')
    + '<div class="ms bonus' + (m.bonus.claimed ? ' claimed' : m.bonus.done ? ' done' : '') + '"><div class="ms-t"><b>Les trois missions du jour</b><span class="bar"><i style="width:' + Math.round((100 * m.missions.filter((x) => x.done).length) / m.missions.length) + '%"></i></span></div>'
    + '<em class="num">' + m.missions.filter((x) => x.done).length + ' / ' + m.missions.length + '</em>'
    + (m.bonus.claimed ? '<span class="ms-ok">+' + m.bonus.reward + ' touchés</span>' : '<button class="btn' + (m.bonus.done ? ' primary' : '') + '" type="button" data-claim="bonus"' + (m.bonus.done ? '' : ' disabled') + '>+' + m.bonus.reward + ' crédits</button>') + '</div></div>';
}
/** Redemande les missions au serveur et les affiche si l'écran Packs est ouvert (un serveur plus ancien ne les connaît pas). */
async function loadMissions() {
  if (S.missions === false || !S.shop) return;
  try { S.missions = await call('GET', '/api/missions'); } catch (e) { if (e instanceof ApiError && e.status === 404) S.missions = false; return; }
  const box = document.getElementById('missions');
  if (box && S.missions) { box.innerHTML = missionsHTML(); box.hidden = false; }
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('#missions [data-claim]');
  if (!b || b.disabled) return;
  b.disabled = true;
  const res = await guard(() => call('POST', '/api/missions/claim', { slot: b.dataset.claim === 'bonus' ? 'bonus' : Number(b.dataset.claim) }));
  if (!res) { b.disabled = false; return; }
  applyState(res);
  S.missions = res;
  sfx.click();
  toast('+' + res.reward + ' crédits');
  const box = document.getElementById('missions');
  if (box) box.innerHTML = missionsHTML();
});

/* compte à rebours : mis à jour chaque seconde, sans redessiner l'écran */
setInterval(() => {
  const box = document.getElementById('packAction');
  if (!box || !S.free || S.opening) return;
  if (box.dataset.sig !== packSig()) {
    box.dataset.sig = packSig();
    box.innerHTML = packActionHTML();
    const pack = $('#packBox .pack');
    if (pack) pack.className = 'pack ' + (packReady() ? 'ready' : 'waiting') + ' k-' + packKind();
    return;
  }
  const left = timeLeft(), count = document.getElementById('count'), bar = document.getElementById('countBar');
  if (count) count.textContent = clock(left);
  if (bar) bar.style.width = Math.min(100, 100 - (100 * left) / packWait()) + '%';
}, 1000);
document.addEventListener('click', async (e) => {
  /* le menu des boosters */
  const choice = e.target.closest('#packMenu [data-pack]');
  if (choice && !S.opening) {
    S.pack = choice.dataset.pack;
    try { localStorage.setItem(STORE + 'booster', S.pack); } catch (err) { /* réglage non gardé */ }
    route();
    return;
  }
  if (e.target.closest('#openPack')) openBooster(packKind(), $('#packBox .pack'));
});
/** Ouvre un booster : le pack gratuit, le booster à crédits, ou un booster du jour gagné au « Champion du jour ».
    from : le sachet d'où part celui de l'ouverture. */
async function openBooster(kind, from) {
  if (S.opening) return;
  S.opening = true;
  const look = kind === 'daily' ? dailyLook(S.daily && S.daily.pack ? S.daily.pack.art : null) : packLook(kind);
  try {
    const result = await runOpening({
      request: async () => {
        const data = await call('POST', '/api/packs/' + (kind === 'credits' || kind === 'daily' ? kind : 'free'));
        /* le serveur vient d'être mis à jour avec de nouvelles cartes : on recharge le catalogue avant de les montrer */
        if (data.catalogVersion && data.catalogVersion !== S.cat.version) await loadCatalogue(data.catalogVersion);
        /* le pack est ouvert : les cartes sont à moi dès maintenant (une revente au bilan part de cet état) */
        applyState(data);
        for (const p of data.pack.cards) {
          const had = S.owned.get(p.id);
          S.owned.set(p.id, { qty: p.qty, at: had ? had.at : now() });
          if (p.serial) S.prints.set(p.id, [...(S.prints.get(p.id) || []), p.serial].sort((a, b) => a - b));
        }
        return data;
      },
      getCat: () => S.cat, fx: S.fx, size: S.free.size, from, look,
      /* au bilan, un doublon se revend sur-le-champ (si le serveur sait racheter les doublons) */
      quick: S.shop && S.shop.quick ? {
        price: (card) => quickPrice(card),
        sell: async (card) => {
          try {
            const res = await call('POST', '/api/market/quick', { card: card.id, qty: 1 });
            applyState(res);
            for (const [id, left] of res.cards) PLAY.owned(id, left);
            return { coins: res.coins, left: (S.owned.get(card.id) || { qty: 1 }).qty };
          } catch (err) {
            toast(err instanceof ApiError ? err.message : 'La vente n\'a pas pu se faire.', true);
            if (!(err instanceof ApiError)) console.error(err);
            return null;
          }
        },
      } : null,
    });
    S.opening = false;
    if (result.goTo === 'collection') { S.filters.sort = 'recent'; S.filters.own = 'owned'; location.hash = '#/collection'; }
    else route();
  } catch (err) {
    S.opening = false;
    if (err instanceof ApiError && (err.code === 'pas_pret' || err.code === 'credits')) { applyState({ free: err.data.free, shop: err.data.shop, daily: err.data.daily, skew: err.data.skew }); toast(err.message, true); route(); }
    else if (err instanceof ApiError && err.status === 401) { clearSession(); S.session = null; showAuth('Ta connexion a expiré. Reconnecte-toi.'); }
    else { toast(err instanceof ApiError ? err.message : 'Un problème est survenu.', true); if (!(err instanceof ApiError)) console.error(err); }
  }
}

/* ---------- écran Collection ---------- */
function filteredCards() {
  const f = S.filters, q = f.q.trim().toLowerCase();
  const list = S.cat.cards.filter((c) => {
    const own = S.owned.has(c.id);
    /* l'onglet « Doublons » : seulement les cartes que j'ai en plusieurs exemplaires */
    if (f.own === 'dupes' && !(own && S.owned.get(c.id).qty > 1)) return false;
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
    /* une édition limitée ne compte pas dans l'effectif à compléter : elle se range avec les versions spéciales */
    const all = cat.base.filter((c) => c.team === id && !c.limited), special = cat.cards.filter((c) => (c.variant || c.limited) && c.team === id);
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
      + '<span class="ros-name">' + logoHTML(g.team.id, 'logo', 80) + '<b>' + esc(g.team.name) + '</b>' + (done ? '<u>Complet</u>' : '') + '<i>' + esc(g.team.league) + ' · note ' + g.rating + '</i></span>'
      + '<span class="ros-meter"><span><b>' + g.have + '</b> / ' + g.total + '</span>'
      + (g.special ? '<em title="Versions spéciales">' + g.haveSpecial + ' / ' + g.special + '</em>' : '')
      + '<span class="bar"><i style="width:' + pct(g.have, g.total) + '%"></i></span></span></summary>'
      + '<div class="grid">' + g.cards.map((c) => tile(c)).join('') + '</div></details>';
  }
  return html;
}
/* ---------- l'onglet « Doublons » : revendre en deux clics, en gardant toujours un exemplaire ---------- */
/** Ce que le jeu rachète d'un coup (« tout vendre ») : les doublons ordinaires des premiers rangs. Renvoie { count, gain }. */
function bulkDupes() {
  const quick = S.shop && S.shop.quick;
  let count = 0, gain = 0;
  if (quick) for (const [id, own] of S.owned) {
    const c = S.cat.cardById.get(id);
    if (c && own.qty > 1 && !c.variant && !c.limited && c.tier <= quick.bulkTier) { count += own.qty - 1; gain += (own.qty - 1) * (quick.tier[c.tier] || 0); }
  }
  return { count, gain };
}
/** Une carte de l'onglet « Doublons » : la carte, et dessous le bouton qui revend tous ses doublons (une édition limitée ne se revend pas ainsi). */
function dupeTile(card) {
  const extra = S.owned.get(card.id).qty - 1, gain = extra * quickPrice(card);
  return '<div class="dupe">' + tile(card)
    + (card.limited ? '<span class="dupe-no">Au marché seulement</span>'
      : '<button class="btn dupe-sell" type="button" data-quick="' + esc(card.id) + '" title="Vendre ' + (extra > 1 ? 'les ' + extra + ' doublons' : 'le doublon') + ' pour ' + num(gain) + ' crédits"'
        + ' data-say="Vendre' + (extra > 1 ? ' ×' + extra : '') + ' · +' + num(gain) + '">Vendre' + (extra > 1 ? ' ×' + extra : '') + ' · +' + num(gain) + '</button>') + '</div>';
}
/** Le bandeau de l'onglet : combien de doublons, ce qu'ils valent, et le bouton qui revend d'un coup ceux des premiers rangs. */
function dupesBar(list) {
  const all = list.reduce((n, c) => n + S.owned.get(c.id).qty - 1, 0), worth = list.reduce((n, c) => n + (c.limited ? 0 : (S.owned.get(c.id).qty - 1) * quickPrice(c)), 0), bulk = bulkDupes();
  if (!all) return '<p><b>Aucun doublon.</b> Chaque carte que tu possèdes n\'est là qu\'en un exemplaire.</p>';
  return '<p><b>' + num(all) + (all > 1 ? ' doublons' : ' doublon') + '</b> · le jeu les rachète tout de suite pour <b>' + num(worth) + ' crédits</b>. Tu gardes toujours un exemplaire de chaque carte.'
    + ' Au marché, un autre joueur t\'en donnerait peut-être davantage.</p>'
    + (bulk.count ? '<button class="btn primary" type="button" id="dupesAll" data-say="Tout vendre (Recrue à Star) · +' + num(bulk.gain) + '">Tout vendre (Recrue à Star) · +' + num(bulk.gain) + '</button>' : '');
}
/** Un bouton de vente se confirme d'un second clic : le premier l'arme pour quelques secondes. Renvoie true au second. */
function armed(btn) {
  if (btn.classList.contains('sure')) return true;
  btn.classList.add('sure');
  btn.textContent = btn.id === 'dupesAll' ? 'Confirmer la vente' : 'Confirmer';
  setTimeout(() => { if (btn.isConnected && btn.classList.contains('sure')) { btn.classList.remove('sure'); btn.textContent = btn.dataset.say; } }, 3500);
  return false;
}
function drawGrid() {
  const grid = document.getElementById('grid');
  if (!grid) return;
  const list = filteredCards(), roster = S.filters.group === 'roster' && S.filters.own !== 'dupes', dupes = S.filters.own === 'dupes';
  const bar = document.getElementById('dupesBar');
  if (bar) { bar.hidden = !dupes; bar.innerHTML = dupes ? dupesBar(list) : ''; }
  const groups = roster ? rosterGroups(list) : [];
  $('#gridCount').textContent = list.length + (list.length > 1 ? ' cartes affichées' : ' carte affichée') + ' · ' + list.filter((c) => S.owned.has(c.id)).length + ' possédées'
    + (roster && groups.length ? ' · ' + groups.length + (groups.length > 1 ? ' rosters' : ' roster') : '');
  grid.className = roster ? 'rosters' : 'grid';
  grid.innerHTML = !list.length ? '' : roster ? rostersHTML(groups) : dupes ? list.map((c) => dupeTile(c)).join('') : list.map((c) => tile(c)).join('');
  $('#gridEmpty').hidden = list.length > 0 || dupes;
}
function viewCollection(main) {
  const f = S.filters, cat = S.cat;
  /* première visite : on montre d'abord ce que le joueur possède, l'album complet est à un clic */
  if (!f.own) f.own = S.owned.size ? 'owned' : 'all';
  const option = (value, text, current) => '<option value="' + esc(value) + '"' + (String(current) === String(value) ? ' selected' : '') + '>' + esc(text) + '</option>';
  const teams = cat.teams.filter((t) => !f.league || t.league === f.league);
  if (f.team && !teams.some((t) => t.id === f.team)) f.team = '';
  /* en tête : trois chiffres (cartes, part du classeur, doublons), puis le classeur ligue par ligue — un clic sur une ligue le filtre */
  const dupes = [...S.owned.values()].reduce((n, o) => n + Math.max(0, o.qty - 1), 0);
  const leagues = cat.leagues.map((l) => {
    const all = cat.cards.filter((c) => c.league === l.id), n = all.filter((c) => S.owned.has(c.id)).length;
    return '<button type="button" data-lg="' + esc(l.id) + '"' + (f.league === l.id ? ' class="on"' : '') + ' title="' + esc(l.name) + ' : ' + n + ' cartes sur ' + all.length + '"><b>' + esc(l.name) + '</b><span class="bar"><i style="width:' + pct(n, all.length) + '%"></i></span><em>' + n + '/' + all.length + '</em></button>';
  }).join('');
  main.innerHTML = '<div class="col-head"><div><h1 class="h1">Collection</h1><p>' + S.owned.size + ' cartes sur ' + cat.cards.length + ' · ' + S.player.cardsTotal + ' exemplaires en tout</p></div>'
    + '<div class="tally"><div><b>' + S.owned.size + '<small>/' + cat.cards.length + '</small></b><span>cartes</span></div><div><b>' + pct(S.owned.size, cat.cards.length) + '<small> %</small></b><span>du classeur</span></div>'
    + '<div class="gold"><b>' + num(dupes) + '</b><span>' + (dupes > 1 ? 'doublons' : 'doublon') + '</span></div></div></div>'
    + '<div class="lg-strip" id="lgStrip">' + leagues + '</div>'
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
    /* « Doublons » : seulement si le serveur sait les racheter */
    + [['all', 'Toutes'], ['owned', 'Possédées']].concat(S.shop ? [['dupes', 'Doublons']] : [], [['missing', 'Manquantes']]).map((o) => '<button type="button" data-own="' + o[0] + '"' + (f.own === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>').join('')
    + '</div><div class="seg small" id="fgroup" role="group" aria-label="Rangement du classeur">'
    + [['', 'À la suite'], ['roster', 'Par roster']].map((o) => '<button type="button" data-group="' + o[0] + '"' + (f.group === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>').join('')
    + '</div><span class="count" id="gridCount"></span></div>'
    + '<div class="dupes-bar" id="dupesBar" hidden></div>'
    + '<div class="grid" id="grid"></div><p class="empty" id="gridEmpty" hidden>Aucune carte ne correspond à ces filtres.</p>';
  if (f.own === 'dupes' && !S.shop) f.own = 'owned';
  drawGrid();
  /* l'onglet « Doublons » : un clic arme le bouton, le second vend */
  main.addEventListener('click', async (e) => {
    const one = e.target.closest('[data-quick]'), all = e.target.closest('#dupesAll');
    if (!one && !all) return;
    if (!armed(one || all)) return;
    (one || all).disabled = true;
    if (one) {
      const card = cat.cardById.get(one.dataset.quick), own = S.owned.get(card.id);
      if (own && own.qty > 1) await quickSell(card, own.qty - 1, true);
      /* vente refusée (compte trop récent, collection qui a bougé) : le bouton retrouve son état */
      if (one.isConnected) drawGrid();
      return;
    }
    const res = await guard(() => call('POST', '/api/market/quick', { all: true }));
    if (!res) { route(); return; }
    applyState(res);
    for (const [id, left] of res.cards) PLAY.owned(id, left);
    toast('+' + num(res.coins) + ' crédits : ' + (res.sold > 1 ? res.sold + ' doublons vendus' : 'un doublon vendu') + '.');
    route();
  });
  let typing = 0;
  $('#fq').addEventListener('input', (e) => { f.q = e.target.value; clearTimeout(typing); typing = setTimeout(drawGrid, 140); });
  $('#fmore').addEventListener('click', (e) => {
    S.filtersOpen = !S.filtersOpen;
    e.currentTarget.classList.toggle('on', S.filtersOpen);
    e.currentTarget.setAttribute('aria-expanded', String(S.filtersOpen));
    $('#fbox').classList.toggle('open', S.filtersOpen);
  });
  $('#lgStrip').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lg]');
    if (!b) return;
    f.league = f.league === b.dataset.lg ? '' : b.dataset.lg;
    sfx.click();
    viewCollection(main);
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
  sfx.page();
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
    + '<div class="sheet-card">' + cardHTML(card, cat, { eager: true, cls: own ? '' : 'missing', qty: own ? own.qty : 0, serial: own ? serialOf(card.id) : 0 })
    + '<span>' + (own ? (own.qty > 1 ? own.qty + ' exemplaires' : '1 exemplaire') + ' · depuis le ' + frDate(own.at) : 'Carte manquante') + '</span>'
    /* l'examiner : seule, en grand, on la tourne et on la retourne du doigt */
    + (own ? '<button class="btn sheet-look" type="button" data-sheet="look">Examiner la carte</button>' : '') + '</div>'
    + '<div class="sheet-info"><div class="sheet-title"><div><h2>' + esc(card.name) + '</h2>'
    + '<p>' + (card.country ? '<img src="' + flagUrl(card.country) + '" alt="">' + esc(cat.countries[card.country]) + ' · ' : '') + esc(card.title || ROLE_NAME[card.role]) + ' · ' + esc(team ? team.name : card.team) + '</p></div>'
    + '<span class="spacer"></span><button class="close" type="button" aria-label="Fermer">' + icon('i-close') + '</button></div>'
    + '<div class="chips"><span class="chip">' + esc(tier.name) + ' · ' + card.ovr + '</span>' + (card.variant ? '<span class="chip v-' + card.variant + '">' + VARIANTS[card.variant].name + '</span>' : '')
    + (card.limited ? '<span class="chip v-ceo">Édition limitée · ' + card.limited + ' exemplaires</span>' + (own && serialOf(card.id) ? '<span class="chip v-ceo">N° ' + (S.prints.get(card.id) || []).join(', ') + '</span>' : '') : '') + '<span class="chip" style="--tc:var(--mut)">' + esc(card.league) + (league ? ' · ' + esc(league.region) : '') + '</span>' + titles + '</div>'
    + '<div><h3 class="h2">Statistiques de la carte</h3><div class="bars">' + statsOf(card).map((s) => '<div title="' + esc(s[3]) + '"><span>' + s[2] + '</span><span class="bar"><i style="width:' + card.stats[s[0]] + '%"></i></span><b>' + card.stats[s[0]] + '</b></div>').join('') + '</div></div>'
    + (facts ? '<div><h3 class="h2">Saison ' + cat.season + (card.kind === 'c' ? ' de son équipe' : ' en chiffres') + '</h3><div class="facts">' + facts + '</div></div>'
      : card.limited ? '<p class="note">« MY CEO » : une édition limitée à ' + card.limited + ' exemplaires numérotés, pas un de plus. Elle prend parfois la place de la carte bonus d\'un pack, tant qu\'il en reste, et se joue au poste de coach.</p>'
        : card.ovr < 10 ? '<p class="note">Une carte hors série, pour rire : elle sort des packs comme les autres, mais mieux vaut un banc vide que ce coach-là.</p>'
          : '<p class="note">Aucune partie officielle jouée cette saison : la note est celle d\'un remplaçant.</p>')
    + (card.champs && card.champs.length ? '<div><h3 class="h2">Champions fétiches</h3><div class="champs">' + card.champs.map((c) => '<div class="champ"><img src="' + iconUrl(cat, c[0]) + '" alt="" loading="lazy"><div><b>' + esc(champName(cat, c[0])) + '</b><span>' + c[1] + ' parties · ' + pct(c[2], c[1]) + ' %</span></div></div>').join('') + '</div></div>' : '')
    + (card.variant === 'legend' ? '<p class="note">Édition légendaire de ' + esc(card.name) + ' : la carte la plus rare du jeu. Contrairement aux autres versions, elle a sa propre note et ses propres statistiques, et porte tous ses titres mondiaux. Elle prend parfois la place de la carte bonus d\'un pack.</p>'
      : card.variant ? '<p class="note">' + (card.variant === 'kc' ? 'Édition Karmine Corp de la carte de ' + esc(card.name) + ' (' + esc(karmineEra(cat, card)) + '), réservée à celles et ceux qui portent ou ont porté ses couleurs'
      : 'Version ' + (card.variant === 'holo' ? 'holographique' : 'full art') + ' de la carte de ' + esc(card.name)) + ' : même joueur, même note, un autre habillage. Elle sort parfois d\'un pack à la place de la carte ordinaire, et se collectionne à part.</p>' : '')
    + '<p class="note">Note calculée à partir des statistiques officielles de la saison ' + cat.season + ' (ligue, tournois internationaux, palmarès). Données : Leaguepedia.</p>'
    /* le marché : vendre un exemplaire, ou chercher qui vend cette carte */
    + (S.live && !S.busy && !S.opening ? '<div class="actions sheet-acts">' + (own ? '<button class="btn" type="button" data-sheet="sell">Vendre un exemplaire</button>' : '')
      + '<button class="btn" type="button" data-sheet="market">' + (own ? 'Voir sur le marché' : 'La chercher au marché') + '</button>'
      /* vente rapide : le jeu rachète un doublon tout de suite, à bas prix */
      + (S.shop && own && own.qty > 1 ? '<button class="btn" type="button" data-sheet="quick">Vente rapide · +' + quickPrice(card) + ' crédits</button>'
        + (own.qty > 2 ? '<button class="btn" type="button" data-sheet="quickall">Vendre les ' + (own.qty - 1) + ' doublons · +' + (own.qty - 1) * quickPrice(card) + '</button>' : '') : '')
      + '</div>' : '')
    + '</div></div>';
  const close = () => { sheet.remove(); document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.insp')) close(); };
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('.close')) { close(); return; }
    const act = e.target.closest('[data-sheet]');
    if (!act) return;
    if (act.dataset.sheet === 'look') { inspectCard(card, cat, { serial: own ? serialOf(card.id) : 0 }); return; }
    if (act.dataset.sheet === 'quick' || act.dataset.sheet === 'quickall') { close(); quickSell(card, act.dataset.sheet === 'quickall' ? S.owned.get(id).qty - 1 : 1); return; }
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

/** Vente rapide : le jeu rachète sur-le-champ des doublons d'une carte. Une belle carte fait d'abord confirmer. */
async function quickSell(card, qty, sure) {
  const gain = qty * quickPrice(card);
  if (!sure && gain >= 60 && !(await confirmSheet('Vente rapide', 'Vendre ' + (qty > 1 ? qty + ' exemplaires' : 'un exemplaire') + ' de ' + card.name + (card.variant ? ' (' + VARIANTS[card.variant].name.toLowerCase() + ')' : '') + ' pour ' + gain + ' crédits ? Au marché, un autre joueur t\'en donnerait peut-être davantage.', 'Vendre'))) { showSheet(card.id); return; }
  const res = await guard(() => call('POST', '/api/market/quick', { card: card.id, qty }));
  if (!res) return;
  applyState(res);
  for (const [id, left] of res.cards) PLAY.owned(id, left);
  toast('+' + res.coins + ' crédits : ' + (res.sold > 1 ? res.sold + ' doublons vendus' : 'un doublon vendu') + '.');
  route();
  /* la fiche se rouvre s'il reste des doublons à vendre (pas depuis l'onglet « Doublons », où l'on enchaîne) */
  if (!sure && (S.owned.get(card.id) || { qty: 0 }).qty > 1) showSheet(card.id);
}

/* ---------- écran Profil ---------- */
async function viewProfile(main) {
  const p = S.player;
  /* en tête : le losange du joueur, son équipe, puis ses chiffres */
  const games = p.wins + p.losses, titles = p.titles || 0;
  main.innerHTML = '<div class="col-head"><div class="pf-id"><i class="who-av pf-av"><span>' + esc(p.name.charAt(0).toUpperCase()) + '</span></i><div><h1 class="h1">' + esc(p.name) + '</h1>'
    + '<p>Joueur depuis le ' + frDate(p.createdAt) + (p.team ? ' · équipe <b>' + esc(p.team.name) + '</b> (' + esc(p.team.short) + ')' : '') + '</p></div></div>'
    + '<div class="tally"><div><b>' + num(p.wins) + '</b><span>' + (p.wins > 1 ? 'victoires' : 'victoire') + '</span></div><div><b>' + (games ? pct(p.wins, games) + '<small> %</small>' : '–') + '</b><span>de réussite</span></div>'
    + '<div><b>' + p.cardsUnique + '<small>/' + S.cat.cards.length + '</small></b><span>cartes</span></div>'
    + (S.live ? '<div class="gold"><b>' + titles + '</b><span>' + (titles > 1 ? 'Mondiaux' : 'Mondial') + '</span></div>' : '') + '</div></div><div class="panels">'
    + '<section class="panel"><h3>Mon compte</h3><div class="kv"><span>Packs ouverts</span><b>' + p.packsOpened + '</b><span>Cartes différentes</span><b>' + p.cardsUnique + ' / ' + S.cat.cards.length + '</b><span>Exemplaires</span><b>' + p.cardsTotal + '</b><span>Parties gagnées</span><b>' + p.wins + ' sur ' + (p.wins + p.losses) + '</b>'
    + (S.live ? '<span>Défis entre joueurs</span><b>' + (p.duelWins || 0) + ' V – ' + (p.duelLosses || 0) + ' D</b><span>Mondiaux remportés</span><b>' + (p.titles || 0) + '</b>' : '')
    + '<span>Crédits</span><b>' + p.coins + '</b></div>'
    /* le nom de son équipe : celui que voient ses adversaires */
    + (p.team ? '<form class="team-form" id="teamForm"><span class="label">Mon équipe</span><div class="team-row"><input class="inp" name="name" maxlength="24" placeholder="' + esc(p.name) + '" value="' + (p.team.custom ? esc(p.team.name) : '') + '" autocomplete="off" aria-label="Nom de l\'équipe">'
      + '<input class="inp team-tag" name="tag" maxlength="4" placeholder="' + esc(p.team.short) + '" value="' + (p.team.custom ? esc(p.team.short) : '') + '" autocomplete="off" aria-label="Sigle"><button class="btn" type="submit">Renommer</button></div>'
      + '<p class="hint">Le nom (3 à 24 caractères) et le sigle (2 à 4 lettres) sous lesquels ton équipe joue ses matchs, ses défis et le Mondial. Vide : elle porte ton pseudo.</p><p class="form-error" role="alert"></p></form>' : '')
    + '<div class="switch"><span>Animations</span><button type="button" id="fxSwitch" aria-pressed="' + S.fx + '" aria-label="Animations"></button></div>'
    + '<div class="switch setting"><span>Son<small>musique de fond et effets</small></span><button class="btn" type="button" id="volBtn" aria-haspopup="dialog">Régler le volume</button></div>'
    + '<div class="actions"><button class="btn" type="button" id="logout">Se déconnecter</button><button class="btn danger" type="button" id="askDelete">Supprimer mon compte</button></div>'
    + '<form id="deleteForm" hidden style="display:grid;gap:10px"><p class="hint">Ton compte et toutes tes cartes seront effacés pour de bon. Tape ton mot de passe pour confirmer.</p>'
    + '<input class="inp" name="password" type="password" autocomplete="current-password" placeholder="Mot de passe" required><p class="form-error" role="alert"></p>'
    + '<div class="actions"><button class="btn danger" type="submit">Effacer définitivement</button><button class="btn" type="button" id="cancelDelete">Annuler</button></div></form></section>'
    + '<section class="panel"><h3>Chances des boosters</h3><div id="odds"><p class="hint">Chargement…</p></div></section>'
    + '<section class="panel"><h3>À propos</h3>'
    + '<p class="hint">' + esc(GAME_NAME) + ' est un projet de fan gratuit de Bcorps Labs. Les cartes représentent les joueurs et coachs en activité dans les ligues majeures (LCK, LPL, LEC, LCS, LCP, CBLOL), saison ' + S.cat.season + '. Catalogue du ' + frDate(Date.parse(S.cat.generated)) + '.</p>'
    + '<p class="hint">Effectifs, statistiques et palmarès : <a href="https://lol.fandom.com/" target="_blank" rel="noopener">Leaguepedia</a>, licence CC BY-SA 3.0. Photos des joueurs : portraits officiels des équipes et des ligues, affichés depuis Leaguepedia. Images des champions : Riot Games (Data Dragon). Logos des équipes : marques de leurs clubs, affichés depuis Leaguepedia. Drapeaux : flag-icons (licence MIT).</p>'
    + '<p class="hint">Musiques : « For Originz », « Ascending the Vale », « Minima » et « Clash Defiant », Kevin MacLeod (<a href="https://incompetech.com/" target="_blank" rel="noopener">incompetech.com</a>), licence <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">Creative Commons Attribution 4.0</a>. '
    + 'Ambiance de tribune : un enregistrement de Félix Blume (<a href="https://freesound.org/people/felix.blume/sounds/500250/" target="_blank" rel="noopener">freesound.org</a>), versé au domaine public. Les autres sons sont fabriqués par le jeu.</p>'
    + '<p class="hint">' + esc(GAME_NAME) + ' was created under Riot Games\' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project. Ce jeu n\'est ni approuvé ni sponsorisé par Riot Games, ni par les équipes et les joueurs cités.</p>'
    + '<div class="actions"><a class="btn" href="../../">Retour à Bcorps Labs</a></div></section></div>';

  $('#fxSwitch').addEventListener('click', (e) => {
    S.fx = !S.fx;
    e.currentTarget.setAttribute('aria-pressed', String(S.fx));
    document.body.classList.toggle('fx', S.fx);
    try { localStorage.setItem(STORE + 'fx', S.fx ? '1' : '0'); } catch (err) { /* réglage non gardé */ }
  });
  $('#volBtn').addEventListener('click', (e) => { sfx.click(); toggleVolume(e.currentTarget, syncTune); });
  $('#logout').addEventListener('click', async () => {
    try { await call('POST', '/api/logout'); } catch (err) { /* la connexion sera de toute façon oubliée ici */ }
    clearSession();
    S.session = null;
    showAuth();
  });
  const teamForm = $('#teamForm');
  if (teamForm) teamForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('.form-error', teamForm);
    error.textContent = '';
    try {
      const res = await call('POST', '/api/team/name', { name: teamForm.name.value, tag: teamForm.tag.value });
      applyState(res);
      toast('Ton équipe s\'appelle maintenant « ' + S.player.team.name + ' » (' + S.player.team.short + ').');
      route();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { clearSession(); S.session = null; showAuth('Ta connexion a expiré. Reconnecte-toi.'); return; }
      error.textContent = err instanceof ApiError ? err.message : 'Un problème est survenu.';
    }
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
  const show = (x) => (x ? frNum(Math.round(10000 * x) / 100) + ' %' : '—');
  /* un tableau par booster : le pack gratuit, puis le booster à crédits */
  const table = (pack) => (data.packs.length > 1 ? '<p class="label odds-name">' + esc(pack.name) + (pack.price ? ' · ' + pack.price + ' crédits' : '') + '</p>' : '')
    + '<table class="odds"><thead><tr><th>Rang</th><th>Cartes 1 à ' + (pack.size - 1) + '</th><th>Carte bonus</th></tr></thead><tbody>'
    + [...S.cat.tiers].reverse().map((t) => '<tr style="--tc:var(--t' + t.id + ')"><td>' + esc(t.name) + '</td><td>' + show(pack.odds[t.id - 1]) + '</td><td>' + show(pack.lastOdds[t.id - 1]) + '</td></tr>').join('')
    + '</tbody></table>';
  /* Ce qu'on a de chances de trouver dans un pack, en pourcentage (quand le serveur le dit) : au moins une carte de chaque rang, de chaque
     version spéciale. C'est ce qui compte pour le joueur ; le détail carte par carte reste dessous, replié. */
  const part = (x) => (!x ? '—' : frNum(x >= 0.1 ? Math.round(x * 100) : x >= 0.01 ? Math.round(x * 1000) / 10 : x >= 0.001 ? Math.round(x * 10000) / 100 : Math.round(x * 100000) / 1000) + ' %');
  const cell = (x) => '<td>' + part(x) + (x && x < 0.2 ? '<i>1 sur ' + num(Math.round(1 / x)) + '</i>' : '') + '</td>';
  const perPack = data.packs.every((p) => p.chances && p.chances.tiers);
  const line = (label, tc, pick, cls) => (data.packs.some((p) => pick(p.chances) > 0)
    ? '<tr' + (cls ? ' class="' + cls + '"' : '') + ' style="--tc:' + tc + '"><td>' + label + '</td>' + data.packs.map((p) => cell(pick(p.chances))).join('') + '</tr>' : '');
  const tierName = (t) => esc(S.cat.tierById.get(t).name);
  const summary = perPack
    ? '<table class="odds per-pack"><thead><tr><th>Dans un pack, au moins…</th>' + data.packs.map((p) => '<th>' + (p.price ? 'Booster à crédits' : 'Pack gratuit') + '</th>').join('') + '</tr></thead><tbody>'
      + [5, 4, 3].map((t) => line('un ' + tierName(t), 'var(--t' + t + ')', (c) => c.tiers[t - 1])).join('')
      + [3, 4, 5].map((t) => line('un ' + tierName(t) + ' holographique', 'var(--t' + t + ')', (c) => c.holo[t - 1], 'sub')).join('')
      + [4, 5].map((t) => line('un ' + tierName(t) + ' full art', 'var(--t' + t + ')', (c) => c.full[t - 1], 'sub')).join('')
      + line('un full art KC', '#4cc3ff', (c) => c.kc, 'sub') + line('une légendaire', '#f0e6d2', (c) => c.legend, 'sub')
      + '</tbody></table>'
      + '<p class="hint">Chaque pack est un tirage au hasard, indépendant des précédents : « 1 pack sur 150 » est une moyenne, pas un compteur — on peut en trouver deux de suite, ou aucun pendant longtemps. Plus une carte est forte, plus sa version spéciale est rare.</p>'
    : '';
  const byTier = (v) => (Array.isArray(v.byTier) ? S.cat.tiers.filter((t) => v.byTier[t.id - 1] > 0).map((t) => show(v.byTier[t.id - 1]) + ' des ' + esc(t.name)).join(', ') : '');
  box.innerHTML = summary + (perPack ? '<details class="more odds-more"><summary>Le détail, carte par carte</summary>' : '') + data.packs.map(table).join('')
    + (data.variants || []).map((v) => {
      const from = S.cat.tiers.filter((t) => t.id >= v.minTier).map((t) => t.name);
      /* (les éditions limitées sont annoncées plus bas, avec ce qu'il en reste) */
      /* l'édition légendaire ne remplace pas une carte tirée : elle prend parfois la place de la carte bonus */
      if (v.id === 'legend') return '<p class="hint"><b class="v-legend">' + esc(v.name) + '</b> — la carte bonus est une carte légendaire dans ' + data.packs.map((p) => 'un ' + (p.price ? 'booster à crédits' : 'pack gratuit') + ' sur ' + Math.round(1 / (p.legend || v.pack))).join(', ') + ' (' + v.cards + (v.cards > 1 ? ' cartes' : ' carte') + ').</p>';
      /* l'édition KC ne dépend pas du rang : elle concerne les joueurs et les coachs passés par la Karmine */
      if (v.id === 'kc') return '<p class="hint"><b class="v-kc">' + esc(v.name) + '</b> — ' + (byTier(v) || show(v.chance)) + ' passés par la Karmine Corp (' + v.cards + ' cartes) sortent dans cette édition.</p>';
      if (byTier(v)) return '<p class="hint"><b class="v-' + esc(v.id) + '">' + esc(v.name) + '</b> — ' + byTier(v) + ' sortent dans cette version.</p>';
      return '<p class="hint"><b class="v-' + esc(v.id) + '">' + esc(v.name) + '</b> — ' + show(v.chance) + ' des cartes ' + esc(from.slice(0, -1).join(', ') + (from.length > 1 ? ' et ' : '') + from[from.length - 1]) + ' sortent dans cette version.</p>';
    }).join('')
    + (perPack ? '</details>' : '')
    + (data.limited || []).map((l) => {
      const card = S.cat.cardById.get(l.card);
      return card ? '<p class="hint"><b class="v-ceo">' + esc(card.name) + (card.edition === 'ceo' ? ' « MY CEO »' : '') + '</b> — édition limitée à ' + l.cap + ' exemplaires numérotés : ' + (l.minted >= l.cap ? 'tous sont sortis.' : l.minted + ' déjà sortis. Elle prend la place de la carte bonus dans '
        + data.packs.map((p) => 'un ' + (p.price ? 'booster à crédits' : 'pack gratuit') + ' sur ' + Math.round(1 / p.limited)).join(', ') + ', tant qu\'il en reste.') + '</p>' : '';
    }).join('')
    + '<p class="hint">Les cartes sont tirées au sort par le serveur. Un coach sort moins souvent qu\'un joueur.</p>';
}

boot();
