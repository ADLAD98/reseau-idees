/* Le « Champion du jour » : tout en bas de l'écran Packs, un champion mystère à deviner — le même pour tous les joueurs, un par jour.
   On propose un nom ; le serveur dit ce que ce champion a en commun avec celui du jour (classe, poste des pros, ressource, portée, région,
   année de sortie), autant de fois qu'il le faut. Trouvé : un booster du jour à ouvrir, aux chances du pack gratuit.
   Le serveur tient le tableau et garde la réponse pour lui ; ici on affiche. Un serveur plus ancien ne connaît pas ce jeu : rien ne s'affiche. */
import { ApiError } from './api.js';
import { esc, iconUrl } from './cards.js';
import { DDRAGON, ROLE_LABEL } from './config.js';
import { packHTML } from './pack.js';

/* G : ce que l'application prête à ce jeu — S (état), call, guard, toast, applyState, now, sfx, openDaily(sachet) */
let G = null;
const box = () => document.getElementById('daily');
const CLASS = { Fighter: 'Combattant', Tank: 'Tank', Mage: 'Mage', Assassin: 'Assassin', Marksman: 'Tireur', Support: 'Support' };
/* les six points comparés, dans l'ordre des colonnes : [clé, titre, ce que disent les flèches vers le haut et vers le bas] */
const COLS = [['cls', 'Classe'], ['pos', 'Poste des pros'], ['res', 'Ressource'], ['rng', 'Portée', 'plus longue', 'plus courte'], ['reg', 'Région'], ['year', 'Sortie', 'plus récente', 'plus ancienne']];
const MARK = { ok: 'Pareil', part: 'En partie', no: 'Différent' };
/* « Kai'Sa », « Dr. Mundo », « Maître Yi » → une clé simple, pour chercher sans se soucier des accents ni de la ponctuation */
const key = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const left = (ms) => { const m = Math.max(1, Math.ceil(ms / 60000)), h = Math.floor(m / 60); return h ? h + ' h ' + String(m % 60).padStart(2, '0') : m + ' min'; };
const tries = (n) => (n > 1 ? n + ' essais' : 'un essai');
/** L'habillage du booster du jour : violet, au nom du jour, illustré par le dernier champion trouvé. */
export const dailyLook = (art) => ({ kind: 'daily', art: art ? art + '_0' : null, title: 'Booster du jour' });

/** La valeur d'un point pour un champion proposé, telle qu'on l'écrit dans sa case. */
function valueOf(g, col, regions) {
  if (col === 'cls') return g.c.map((t) => CLASS[t] || t).join(' · ');
  if (col === 'pos') return g.r.length ? g.r.map((r) => ROLE_LABEL[r] || r).join(' · ') : 'Pas joué';
  if (col === 'res') return g.res;
  if (col === 'rng') return String(g.rng);
  if (col === 'reg') return (regions && regions[g.reg]) || g.reg;
  return String(g.y);
}
/** Une ligne du tableau. fresh : elle vient d'être proposée (ses cases se retournent une à une). */
function rowHTML(g, fresh) {
  const S = G.S, regions = S.dailyPool && S.dailyPool.regions;
  return '<div class="dg-row' + (fresh ? ' new' : '') + '" role="row"><div class="dg-who" role="cell"><img src="' + iconUrl(S.cat, g.id) + '" alt="" width="40" height="40" loading="lazy" decoding="async"><b>' + esc(g.n) + '</b></div>'
    + COLS.map(([col, title, up, down], i) => {
      const m = g.cmp[col], arrow = m === 'up' || m === 'down';
      const say = arrow ? 'Celle du champion du jour est ' + (m === 'up' ? up : down) : MARK[m];
      return '<div class="dg-cell m-' + (arrow ? 'no' : m) + '" style="--i:' + i + '" role="cell" data-l="' + esc(title) + '" title="' + esc(title + ' : ' + say.toLowerCase()) + '"><span>' + esc(valueOf(g, col, regions))
        + (arrow ? '<i class="dg-arrow ' + m + '" aria-label="' + esc(say) + '"></i>' : '') + '</span></div>';
    }).join('') + '</div>';
}
/** Le sachet du booster du jour, en petit, avec le bouton qui l'ouvre. */
function prizeHTML(D) {
  const S = G.S, n = D.pack.count;
  return '<div class="dg-prize"><div class="dg-pack" id="dgPack">' + packHTML('ready', S.cat.season, S.free.size, dailyLook(D.pack.art)) + (n > 1 ? '<span class="badge qty">×' + n + '</span>' : '') + '</div>'
    + '<div><b>' + (n > 1 ? n + ' boosters du jour' : 'Ton booster du jour') + '</b><p>' + S.free.size + ' cartes, aux mêmes chances que le pack gratuit.</p>'
    + '<button class="btn primary" type="button" id="dgOpen">Ouvrir<span class="hide-s"> le booster du jour</span></button></div></div>';
}
/** Le haut du panneau : la saisie d'un nom tant que le champion n'est pas trouvé, puis le résultat et le booster gagné. */
function topHTML() {
  const S = G.S, D = S.daily, next = '<p class="dg-next">Nouveau champion dans <b id="dgLeft">' + left(D.resetAt - G.now()) + '</b></p>';
  if (D.solved) {
    const name = (D.guesses.find((g) => g.id === D.answer) || { n: D.answer }).n;
    return '<div class="dg-won"><img class="dg-splash" src="' + DDRAGON + '/img/champion/splash/' + esc(D.answer) + '_0.jpg" alt="" loading="lazy" decoding="async">'
      + '<div class="dg-won-t"><span class="eyebrow">Trouvé en ' + tries(D.tries) + '</span><h3>' + esc(name) + '</h3>' + next + '</div>'
      + (D.pack.count ? prizeHTML(D) : '<p class="dg-done">Booster du jour ouvert.<br>À demain pour le prochain champion.</p>') + '</div>';
  }
  return '<div class="dg-ask"><div class="dg-intro"><p>Un champion mystère, le même pour tous les joueurs. Propose un nom : chaque essai te dit ce qu\'il a en commun avec lui. Trouve-le, et tu gagnes un <b>booster du jour</b>.</p>' + next + '</div>'
    + '<form class="dg-form" id="dgForm" novalidate autocomplete="off"><div class="dg-in"><input class="inp" id="dgQ" type="search" placeholder="' + (innerWidth <= 480 ? 'Un champion…' : 'Nom d\'un champion…') + '" maxlength="24" autocapitalize="off" spellcheck="false" aria-label="Nom du champion à proposer" aria-controls="dgList">'
    + '<div class="dg-list" id="dgList" role="listbox" hidden></div></div><button class="btn primary" type="submit">Proposer</button></form></div>'
    /* un booster gagné un autre jour, pas encore ouvert */
    + (D.pack.count ? '<div class="dg-wait">' + prizeHTML(D) + '</div>' : '');
}
const legend = '<p class="dg-legend"><span class="m-ok">pareil</span><span class="m-part">en partie</span><span class="m-no">différent</span>'
  + '<span><i class="dg-arrow up"></i>plus haut chez le champion du jour</span><span><i class="dg-arrow down"></i>plus bas</span></p>';
function boardHTML() {
  const D = G.S.daily;
  if (!D.guesses.length) return '<p class="dg-none">Aucun essai pour l\'instant. Un conseil : commence par un champion que tu connais bien.</p>';
  return legend + '<div class="dg-board" role="table" aria-label="Mes essais"><div class="dg-row dg-cols" role="row"><div role="columnheader">Champion</div>' + COLS.map((c) => '<div role="columnheader">' + c[1] + '</div>').join('') + '</div>'
    /* le dernier essai en haut */
    + '<div id="dgRows" role="rowgroup">' + D.guesses.slice().reverse().map((g) => rowHTML(g)).join('') + '</div></div>';
}
/** Affiche le jeu d'après ce qu'on sait déjà (rien tant que le serveur n'a pas répondu une première fois). */
export function drawDaily(ctx) {
  if (ctx) G = ctx;
  const el = box();
  if (!G) return;
  const D = G.S.daily;
  /* (sur l'onglet Boosters, seulement la ligne qui y mène) */
  if (el) el.hidden = !D;
  if (el && D) el.innerHTML ='<h2 class="h2">Champion du jour' + (D.tries && !D.solved ? ' · ' + tries(D.tries) : '') + '</h2><div class="dg panel"><div id="dgTop">' + topHTML() + '</div><div id="dgBoard">' + boardHTML() + '</div></div>';
  teaser();
}
/** Sous le pack, une ligne qui mène au jeu tant que le champion du jour n'est pas trouvé (ou qu'un booster du jour attend). */
function teaser() {
  const el = document.getElementById('dailyTeaser'), D = G && G.S.daily;
  if (!el) return;
  const text = !D ? '' : D.pack.count ? 'Ton booster du jour t\'attend' : D.solved ? '' : D.tries ? 'Champion du jour : ' + tries(D.tries) + ', il résiste encore' : 'Champion du jour : devine-le pour gagner un booster';
  el.hidden = !text;
  el.innerHTML = text ? '<button type="button" id="dgGo"><i></i><b>' + text + '</b><em>' + (D.pack.count ? 'Ouvrir' : 'Jouer') + ' ›</em></button>' : '';
}

/** Demande au serveur où j'en suis aujourd'hui, puis affiche le jeu si l'écran Packs est ouvert. */
export async function loadDaily(ctx) {
  G = ctx;
  const S = G.S;
  if (S.daily === false || !S.dailyOn) return;
  let data = null;
  try { data = await G.call('GET', '/api/guess' + (S.dailyPool ? '' : '?pool=1')); } catch (e) { if (e instanceof ApiError && e.status === 404) S.daily = false; return; }
  if (data.pool) S.dailyPool = { list: data.pool.map(([id, name]) => ({ id, name, key: key(name) })), regions: data.regions };
  S.daily = { day: data.day, resetAt: data.resetAt, solved: data.solved, tries: data.tries, guesses: data.guesses, answer: data.answer, pack: data.pack };
  /* (si le joueur est en train de taper un nom, on ne lui retire pas sa saisie pour redessiner la même chose) */
  const q = document.getElementById('dgQ');
  if (!q || !q.value || data.solved || data.tries !== document.querySelectorAll('#dgRows .dg-row').length) drawDaily();
  else teaser();
}

/* ---------- la saisie : quelques champions qui correspondent à ce qui est tapé ---------- */
let active = 0, shown = [];
function suggest() {
  const q = document.getElementById('dgQ'), list = document.getElementById('dgList'), S = G.S;
  if (!q || !list || !S.dailyPool) return;
  const typed = key(q.value), done = new Set(S.daily.guesses.map((g) => g.id));
  /* d'abord ceux dont le nom commence par ce qui est tapé, puis ceux qui le contiennent */
  /* (moins de propositions sur un téléphone : elles doivent tenir entre le champ et le clavier) */
  shown = typed ? S.dailyPool.list.filter((c) => !done.has(c.id) && c.key.includes(typed)).sort((a, b) => (b.key.startsWith(typed) - a.key.startsWith(typed))).slice(0, innerWidth <= 860 ? 5 : 7) : [];
  active = Math.min(active, Math.max(0, shown.length - 1));
  list.hidden = !shown.length;
  list.innerHTML = shown.map((c, i) => '<button type="button" role="option" data-champ="' + esc(c.id) + '"' + (i === active ? ' class="on" aria-selected="true"' : '') + '><img src="' + iconUrl(S.cat, c.id) + '" alt="" width="28" height="28" loading="lazy">' + esc(c.name) + '</button>').join('');
}
async function propose(id) {
  const S = G.S, q = document.getElementById('dgQ'), form = document.getElementById('dgForm');
  if (!id || !form || form.dataset.busy) return;
  form.dataset.busy = '1';
  let res = null;
  try { res = await G.call('POST', '/api/guess', { champion: id }); } catch (e) {
    delete form.dataset.busy;
    if (e instanceof ApiError && e.status === 401) { G.expired(); return; }
    G.toast(e instanceof ApiError ? e.message : 'Un problème est survenu.', true);
    /* le tableau a peut-être changé ailleurs (un autre onglet, minuit passé) : on le redemande */
    if (e instanceof ApiError && e.status === 409) loadDaily(G);
    return;
  }
  G.applyState(res);
  const mine = { day: res.day, resetAt: res.resetAt, solved: res.solved, tries: res.tries, guesses: res.guesses, answer: res.answer, pack: res.pack || S.daily.pack };
  S.daily = mine;
  /* la nouvelle ligne arrive en haut du tableau, ses cases se retournent l'une après l'autre */
  const boardEl = document.getElementById('dgBoard'), el = box();
  if (!document.getElementById('dgRows')) boardEl.innerHTML = boardHTML().replace('class="dg-row"', 'class="dg-row new"');
  else document.getElementById('dgRows').insertAdjacentHTML('afterbegin', rowHTML(res.guess, true));
  const title = el && el.querySelector('.h2');
  if (title) title.textContent = 'Champion du jour' + (res.solved ? '' : ' · ' + tries(res.tries));
  const fx = document.body.classList.contains('fx');
  if (fx) COLS.forEach((c, i) => setTimeout(() => G.sfx.clue(i), 120 + i * 200));
  if (res.solved) {
    /* trouvé : le temps que la ligne se retourne, puis le champion se dévoile et le booster du jour apparaît */
    setTimeout(() => { const top = document.getElementById('dgTop'); if (top && G.S.daily === mine) { top.innerHTML = topHTML(); if (fx) G.sfx.shimmer(5); G.toast('Champion du jour trouvé : un booster du jour t\'attend.'); teaser(); } }, fx ? 1500 : 0);
    return;
  }
  delete form.dataset.busy;
  if (q) { q.value = ''; q.focus({ preventScroll: true }); }
  active = 0;
  suggest();
  teaser();
}
document.addEventListener('input', (e) => { if (e.target.id === 'dgQ' && G) { active = 0; suggest(); } });
/* sur un téléphone, le clavier recouvre le bas de l'écran : le champ remonte en haut, ses propositions restent visibles */
document.addEventListener('focusin', (e) => {
  if (e.target.id !== 'dgQ' || innerWidth > 860) return;
  setTimeout(() => { const top = e.target.getBoundingClientRect().top; if (document.activeElement === e.target && Math.abs(top - 92) > 24) window.scrollBy({ top: top - 92, behavior: 'smooth' }); }, 280);
});
document.addEventListener('keydown', (e) => {
  if (e.target.id !== 'dgQ' || !G) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (shown.length) { active = (active + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length; suggest(); } }
  else if (e.key === 'Escape') { const list = document.getElementById('dgList'); if (list) list.hidden = true; }
});
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'dgForm' || !G) return;
  e.preventDefault();
  /* Entrée : le champion surligné ; à défaut, celui dont le nom est tapé en entier */
  const q = document.getElementById('dgQ'), typed = key(q.value), exact = G.S.dailyPool && G.S.dailyPool.list.find((c) => c.key === typed);
  const pick = shown[active] || exact;
  if (pick) propose(pick.id); else if (typed) G.toast('Choisis un champion dans la liste.', true);
});
document.addEventListener('click', (e) => {
  if (!G) return;
  const option = e.target.closest('#dgList [data-champ]');
  if (option) { propose(option.dataset.champ); return; }
  if (e.target.closest('#dgOpen')) { G.openDaily(document.querySelector('#dgPack .pack')); return; }
  if (e.target.closest('#dgGo')) {
    /* le champion du jour est dans l'onglet Défis : on y va, puis on descend jusqu'à lui */
    const reach = () => {
      const el = box(), D = G.S.daily;
      if (!el || el.hidden) return false;
      el.scrollIntoView({ behavior: document.body.classList.contains('fx') ? 'smooth' : 'auto', block: 'start' });
      const q = document.getElementById('dgQ');
      if (q && D && !D.pack.count) setTimeout(() => q.focus({ preventScroll: true }), 450);
      return true;
    };
    if (!reach()) { location.hash = '#/packs/defis'; let n = 0; const wait = () => { if (!reach() && ++n < 30) setTimeout(wait, 120); }; setTimeout(wait, 150); }
  }
});
/* le temps qui reste avant le prochain champion ; à l'heure dite, le tableau du nouveau jour est demandé */
setInterval(() => {
  const el = document.getElementById('dgLeft'), D = G && G.S.daily;
  if (!el || !D) return;
  const ms = D.resetAt - G.now();
  if (ms <= 0) { G.S.daily = null; loadDaily(G); return; }
  el.textContent = left(ms);
}, 15000);
