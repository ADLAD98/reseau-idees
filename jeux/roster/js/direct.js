/* « En direct » : sur ordinateur, une fine bande accrochée sous la barre du haut, à droite, sur toutes les pages, quand un vrai match
   pro suivi par les pronostics se joue (serveur : GET /api/live, public) : le score des manches et la manche en cours (temps,
   éliminations, écart d'or), relevés au plus toutes les deux minutes. Un clic mène aux pronostics (écran Packs) ; la croix la cache
   jusqu'au match suivant. Sur téléphone : rien (le bloc des pronostics montre le match). Face à un serveur sans /api/live : rien. */
import { esc, logoHTML } from './cards.js';
import { STORE } from './config.js';

const WIDE = matchMedia('(min-width: 861px)');
const HIDDEN = STORE + 'direct-cache';
/* la relève : toutes les deux minutes pendant un match (le serveur relit le site officiel au plus aussi souvent), cinq sinon */
const EVERY = 120000, IDLE = 300000;
let G = null, started = false, timer = 0, live = [], fetchedAt = 0;

const hidden = () => { try { return JSON.parse(localStorage.getItem(HIDDEN) || '[]'); } catch (e) { return []; } };
const team = (t) => (logoHTML(t.code, 'lt-logo', 48) || '') + '<b>' + esc(t.code) + '</b>';

/** La manche en cours, en quelques mots : « Manche 2 · 14:32 · kills 5–3 · or +2,1 k MVK » (aussi pour le bloc des pronostics). */
export function liveDetail(m) {
  const g = m.now, head = 'Manche ' + m.game;
  if (!g) return head;
  if (g.state === 'draft') return head + ' · en préparation';
  if (g.state === 'finished') return head + ' terminée';
  const clock = Math.floor(g.clock / 60) + ':' + String(g.clock % 60).padStart(2, '0');
  const diff = g.gold[0] - g.gold[1], lead = m.teams[diff > 0 ? 0 : 1].code;
  const gold = Math.abs(diff) < 500 ? 'or égal' : 'or +' + (Math.abs(diff) / 1000).toFixed(1).replace('.', ',') + ' k ' + lead;
  return head + ' · ' + clock + (g.state === 'paused' ? ' (pause)' : '') + ' · kills ' + g.kills[0] + '–' + g.kills[1] + ' · ' + gold;
}

/** À appeler une fois la barre du haut posée (app.js, shell) : la première fois, lance la relève. */
export function startLive(ctx) {
  G = ctx;
  if (started) { draw(); return; }
  started = true;
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - fetchedAt > EVERY / 2) fetchLive(); });
  WIDE.addEventListener('change', () => { if (WIDE.matches && !fetchedAt) fetchLive(); else draw(); });
  document.addEventListener('click', onClick);
  fetchLive();
}

async function fetchLive() {
  clearTimeout(timer);
  timer = setTimeout(fetchLive, IDLE);
  if (!G || document.hidden || !WIDE.matches) return;
  fetchedAt = Date.now();
  try { live = (await G.call('GET', '/api/live')).live || []; } catch (e) { live = []; }
  if (live.length) { clearTimeout(timer); timer = setTimeout(fetchLive, EVERY); }
  draw();
}

function draw() {
  const el = document.getElementById('liveTab');
  if (!el) return;
  const skip = hidden();
  const list = WIDE.matches ? live.filter((m) => !skip.includes(m.id)) : [];
  const m = list[0];
  if (!m) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  /* une seule ligne, pour ne rien cacher du haut des pages (les chiffres de la Collection, du Profil…) */
  const title = m.leagueName + (m.block ? ' · ' + m.block : '') + ' · ' + m.teams[0].name + ' contre ' + m.teams[1].name + (m.bestOf > 1 ? ' · Bo' + m.bestOf : '') + ' — voir les pronostics';
  el.innerHTML = '<a class="lt-link" href="#/packs" title="' + esc(title) + '">'
    + '<i class="pr-dot" aria-hidden="true"></i><b class="lt-live">En direct</b>'
    + '<span class="lt-score"><span class="lt-team">' + team(m.teams[0]) + '</span><strong>' + m.teams[0].wins + ' – ' + m.teams[1].wins + '</strong><span class="lt-team">' + team(m.teams[1]) + '</span></span>'
    + '<span class="lt-foot">' + esc(liveDetail(m)) + (list.length > 1 ? ' · +' + (list.length - 1) : '') + '</span></a>'
    + '<button type="button" class="lt-close" data-live-hide="' + esc(m.id) + '" aria-label="Masquer ce match" title="Masquer">×</button>';
}

function onClick(e) {
  const close = e.target.closest('[data-live-hide]');
  if (close) {
    const ids = hidden().filter((id) => id !== close.dataset.liveHide).concat(close.dataset.liveHide).slice(-20);
    try { localStorage.setItem(HIDDEN, JSON.stringify(ids)); } catch (err) { /* caché pour cette page seulement */ live = live.filter((m) => m.id !== close.dataset.liveHide); }
    if (G && G.sfx) G.sfx.click();
    draw();
    return;
  }
  const link = e.target.closest('#liveTab .lt-link');
  if (!link) return;
  e.preventDefault();
  if (G && G.sfx) G.sfx.click();
  if (location.hash !== '#/packs') location.hash = '#/packs';
  /* l'écran Packs pose le bloc des pronostics dès que le serveur a répondu : on y descend alors */
  const begun = Date.now();
  const reach = () => {
    const box = document.getElementById('prono');
    if (box && !box.hidden) {
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      /* les blocs du dessus (missions, événement) arrivent après lui et le repoussent : on recale une fois l'écran posé */
      setTimeout(() => { const t = box.getBoundingClientRect().top; if (t < 0 || t > innerHeight * 0.4) box.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 900);
    } else if (Date.now() - begun < 4000) setTimeout(reach, 120);
  };
  setTimeout(reach, 60);
}
