/* Le Mondial : un tournoi contre les équipes réelles, dirigées par l'ordinateur.
   Quatre poules de quatre, puis quarts de finale (BO3), demi-finales et finale (BO5). Le serveur tire les poules, joue les autres
   rencontres et verse les récompenses ; cet écran montre le tableau et enchaîne draft et partie pour les matchs du joueur. */
import { ApiError } from './api.js';
import { esc } from './cards.js';
import { runDraft } from './draft.js';
import { runMatch } from './match.js';
import { confirmSheet, num, plural } from './ui.js';

const $ = (sel, root) => (root || document).querySelector(sel);
const STAGE = { groups: 'Phase de poules', quarter: 'Quart de finale', semi: 'Demi-finale', final: 'Finale' };
const REACHED = { quarter: 'Qualifié pour les quarts de finale', semi: 'Qualifié pour les demi-finales', final: 'Qualifié pour la finale', champion: 'Champion du monde' };
const BEST = { groups: 'phase de poules', quarter: 'quarts de finale', semi: 'demi-finales', final: 'finale', champion: 'titre' };
let G = null;
const onView = () => /^#\/?jouer\/mondial/.test(location.hash) && !!document.getElementById('main');
const bo = (n) => (n === 1 ? 'une manche' : 'BO' + n);
/* une durée, en clair : « 4 h 36 », « 25 min » */
const span = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); return m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') : m + ' min'; };

export async function viewWorlds(main, ctx) {
  G = ctx;
  const S = G.S;
  if (!S.worlds) S.worlds = { data: null, done: null };
  draw(main);
  const data = await G.guard(() => G.call('GET', '/api/worlds'));
  if (!data) return;
  S.worlds.data = data;
  if (data.run) S.worlds.done = null;
  if (onView()) draw($('#main'));
}

/* ---------- le tableau ---------- */
function draw(main) {
  const S = G.S, W = S.worlds, D = W.data;
  const head = '<div class="col-head"><div><a class="back" href="#/jouer">‹ Jouer</a><h1 class="h1">Mondial</h1><p>Seize équipes, une seule couronne. Poules, quarts, demies, finale.</p></div>'
    + (D ? '<div class="tally"><div class="gold"><b>' + D.record.titles + '</b><span>' + (D.record.titles > 1 ? 'titres' : 'titre') + '</span></div><div><b>' + D.record.runs + '</b><span>' + (D.record.runs > 1 ? 'participations' : 'participation') + '</span></div></div>' : '') + '</div>';
  if (!D) { main.innerHTML = '<div id="wd">' + head + '<div class="center" style="min-height:30dvh"><div class="spin"></div></div></div>'; return; }
  /* le parcours en cours, ou celui qui vient de se terminer (gardé à l'écran tant qu'on n'en relance pas un) */
  const run = D.run || W.done;
  main.innerHTML = '<div id="wd">' + head + (run ? runHTML(run, !D.run) : '') + (D.run ? '' : introHTML(D, !!run)) + '</div>';
  const root = $('#wd', main);
  root.addEventListener('click', onClick);
}
function introHTML(D, after) {
  const R = D.rules, S = G.S, short = D.fee > S.player.coins;
  /* les packs d'un tour ne se gagnent qu'une fois par jour (D.packs, quand le serveur applique cette règle) : ceux d'aujourd'hui sont
     déjà pris, ou pas ; les crédits se gagnent à chaque parcours */
  const P = D.packs || null, gone = (key) => !!(P && P.got.includes(key));
  const prize = (key, label) => '<div><span>' + label + '</span><b>+' + num(R.bonus[key][0]) + ' crédits</b>'
    + (gone(key) ? '<em class="dim">' + plural(R.bonus[key][1], 'pack déjà gagné', 'packs déjà gagnés') + ' aujourd\'hui</em>' : '<em>+ ' + plural(R.bonus[key][1], 'pack', 'packs') + '</em>') + '</div>';
  const past = Object.entries(D.record.past || {}).filter(([k]) => BEST[k]).map(([k, n]) => n + ' × ' + BEST[k]).join(' · ');
  return '<section class="panel wd-intro">' + (after ? '' : '<h3>Le tournoi</h3><ul>'
    + '<li><b>Seize équipes</b> — la tienne et les quinze meilleures des six ligues majeures : ' + Object.entries(R.slots).map(([l, n]) => n + ' de ' + l).join(', ') + '.</li>'
    + '<li><b>Poules</b> — quatre poules de quatre. Tu rencontres les trois autres en une manche ; les deux premiers passent.</li>'
    + '<li><b>Phase finale</b> — quarts de finale en trois manches (BO3), demi-finales et finale en cinq (BO5).</li>'
    + '<li><b>Ton équipe</b> — celle que tu alignes dans l\'onglet Jouer ; tu peux la retoucher entre deux rencontres.</li>'
    + '<li>Chaque manche gagnée rapporte ses crédits, comme un match ordinaire. S\'y ajoutent les primes ci-dessous.</li></ul>'
    + '<div class="prizes wd-prizes">' + prize('quarter', 'Sortir des poules') + prize('semi', 'Demi-finale') + prize('final', 'Finale') + prize('champion', 'Champion') + '</div>'
    + (P ? '<p class="hint wd-daily">Les packs d\'un tour se gagnent <b>une fois par jour</b> : ils reviennent à minuit, heure française (dans ' + span(P.resetAt - P.now) + '). Les crédits, eux, se gagnent à chaque parcours.</p>' : ''))
    + (past ? '<p class="hint">Tes parcours passés : ' + esc(past) + '.</p>' : '')
    + '<div class="actions"><button class="btn primary big" type="button" data-wd="start"' + (short ? ' disabled' : '') + '>' + (after ? 'Nouveau Mondial' : 'S\'inscrire') + '</button>'
    + '<p class="note">' + (D.fee ? 'Inscription : ' + num(D.fee) + ' crédits' + (short ? ' — il t\'en manque ' + num(D.fee - S.player.coins) + '.' : ' (tu en as ' + num(S.player.coins) + ').') : 'Ta première participation est offerte. Les suivantes coûteront ' + num(R.fee) + ' crédits.') + '</p></div></section>';
}
function runHTML(run, over) {
  const T = run.teams, name = (i) => (i === null || i === undefined ? '…' : esc(T[i].name));
  const cls = (i) => (i === run.me ? ' me' : '');
  /* le prochain match, ou le bilan si le parcours est fini */
  let top;
  if (over) {
    const champ = run.stage === 'champion', last = run.path[run.path.length - 1];
    top = '<section class="panel wd-next ' + (champ ? 'win' : 'out') + '"><div><span>' + (champ ? 'Tournoi remporté' : 'Parcours terminé') + '</span><b>' + (champ ? 'Champion du monde !' : 'Éliminé en ' + (last ? BEST[last.stage] : 'poules')) + '</b>'
      + '<i>' + (champ ? '' : 'Champion : ' + name(run.champion) + ' · ') + 'Gains du tournoi : ' + num(run.earned.coins) + ' crédits' + (run.earned.packs ? ' et ' + plural(run.earned.packs, 'pack', 'packs') : '') + '</i></div></section>';
  } else if (run.series && run.series.phase !== 'done') {
    const sv = run.series, n = run.next;
    top = '<section class="panel wd-next"><div><span>' + (n ? esc(n.label) : 'Rencontre en cours') + ' · ' + bo(sv.format) + '</span><b>' + esc(sv.names[0]) + ' ' + sv.wins[0] + ' – ' + sv.wins[1] + ' ' + esc(sv.names[1]) + '</b>'
      + '<i>' + (sv.phase === 'draft' ? 'Draft de la manche ' + sv.game + ' en cours.' : 'Manche ' + (sv.games.length + 1) + ' à jouer.') + '</i></div>'
      + '<div class="wd-go"><button class="btn primary big" type="button" data-wd="play">' + (sv.phase === 'draft' ? 'Reprendre la draft' : 'Manche suivante') + '</button>' + SIM + '</div></section>';
  } else if (run.next) {
    const n = run.next, gap = n.rating - T[run.me].rating;
    top = '<section class="panel wd-next"><div><span>' + esc(n.label) + ' · ' + bo(n.format) + '</span><b>contre ' + esc(n.name) + '</b>'
      + '<i>Note ' + n.rating + ' — la tienne : ' + T[run.me].rating + (gap >= 6 ? '. Un gros morceau.' : gap <= -6 ? '. À ta portée.' : '. Match serré.') + ' Tu peux encore retoucher ton équipe dans l\'onglet Jouer.</i></div>'
      + '<div class="wd-go"><button class="btn primary big" type="button" data-wd="play">Jouer le match</button>' + SIM + '</div></section>';
  } else top = '';
  /* les poules */
  const letters = ['A', 'B', 'C', 'D'];
  const groups = run.groups.map((g, k) => '<div class="wd-group"><h3>Poule ' + letters[k] + '</h3><table class="wd-table"><tbody>' + g.table.map((r, pos) => '<tr class="' + (pos < 2 && (run.stage !== 'groups' || run.day > 2) ? 'in' : '') + cls(r.team) + '">'
    + '<td>' + (pos + 1) + '</td><td><b>' + esc(T[r.team].name) + '</b><i>' + (T[r.team].league ? esc(T[r.team].league) + ' · ' : 'toi · ') + T[r.team].rating + '</i></td><td class="num">' + r.wins + ' – ' + r.losses + '</td></tr>').join('') + '</tbody></table></div>').join('');
  /* la phase finale */
  const tie = (t) => {
    if (!t) return '<div class="wd-tie tbd"><span>…</span><span>…</span></div>';
    const side = (i, k) => '<span class="' + (t.winner === i ? 'won' : t.winner !== null ? 'lost' : '') + cls(i) + '"><b>' + esc(T[i].short || T[i].name) + '</b>' + (t.wins ? '<em>' + t.wins[k] + '</em>' : '') + '</span>';
    return '<div class="wd-tie">' + side(t.a, 0) + side(t.b, 1) + '</div>';
  };
  const col = (list, n) => '<div class="wd-col">' + Array.from({ length: n }, (x, k) => tie(list[k])).join('') + '</div>';
  const bracket = '<div class="wd-bracket wd-heads"><h3>Quarts · BO3</h3><h3>Demies · BO5</h3><h3>Finale · BO5</h3><h3>Champion</h3></div>'
    + '<div class="wd-bracket">' + col(run.quarter, 4) + col(run.semi, 2) + col(run.final, 1)
    + '<div class="wd-col"><div class="wd-champ' + (run.champion === run.me ? ' me' : '') + '">' + (run.champion !== null && run.champion !== undefined ? esc(T[run.champion].name) : '…') + '</div></div></div>';
  /* mon parcours */
  const path = run.path.map((p) => '<div class="hist-row ' + (p.won ? 'win' : 'lose') + '"><b>' + (p.won ? 'Victoire' : 'Défaite') + '</b><span class="hist-foe">' + STAGE[p.stage] + ' · contre ' + name(p.foe) + '</span>'
    + '<span class="hist-score">' + p.wins[0] + ' – ' + p.wins[1] + '</span><span></span><span></span></div>').join('');
  return top
    + '<section><h2 class="h2">Poules' + (run.stage === 'groups' ? ' · journée ' + Math.min(3, run.day + 1) + ' sur 3' : '') + '</h2><div class="wd-groups">' + groups + '</div></section>'
    + '<section><h2 class="h2">Phase finale</h2>' + (run.quarter.length ? bracket : '<p class="empty">Le tableau se dessinera à la fin des poules : les deux premiers de chaque poule, premiers contre deuxièmes.</p>') + '</section>'
    + (path ? '<section><h2 class="h2">Mon parcours</h2><div class="hist">' + path + '</div>'
      + '<p class="hint wd-earned">Gains du tournoi : <b>' + num(run.earned.coins) + ' crédits</b>' + (run.earned.packs ? ' et <b>' + plural(run.earned.packs, 'pack', 'packs') + '</b>' : '') + '.</p></section>' : '')
    + (over ? '' : '<div class="actions wd-quit"><button class="btn danger" type="button" data-wd="quit">Abandonner ce Mondial</button></div>');
}

/* le bouton qui joue la rencontre en laissant le coach faire les drafts */
const SIM = '<button class="btn" type="button" data-wd="sim" title="Ton coach fait les drafts à ta place, selon son talent : on passe directement aux parties.">Simuler les drafts</button>';

/* ---------- actions ---------- */
async function onClick(e) {
  const b = e.target.closest('[data-wd]');
  if (!b || !G) return;
  const what = b.dataset.wd, S = G.S;
  if (what === 'start') {
    b.disabled = true;
    const res = await G.guard(() => G.call('POST', '/api/worlds/start'));
    if (res) { G.applyState(res); S.worlds.done = null; S.worlds.data.run = res.run; S.worlds.data.record.runs++; G.toast('Les poules sont tirées. Bonne chance !'); }
    if (onView()) { const data = await G.guard(() => G.call('GET', '/api/worlds')); if (data) S.worlds.data = data; if (onView()) draw($('#main')); }
  } else if (what === 'play' || what === 'sim') {
    b.disabled = true;
    play(what === 'sim');
  } else if (what === 'quit') {
    if (!(await confirmSheet('Abandonner le Mondial ?', 'Ton parcours s\'arrête là. Les crédits et les packs déjà gagnés te restent ; l\'inscription n\'est pas rendue.', 'Abandonner', { danger: true }))) return;
    await G.guard(() => G.call('POST', '/api/worlds/quit'));
    S.worlds.done = null;
    viewWorlds($('#main'), G);
  }
}

/* le résultat affiché après une manche */
function rewardsFor(res) {
  const run = res.run, p = res.played, sv = run.series, last = run.path[run.path.length - 1];
  const bonus = p.bonus ? '<div class="prize bonus"><span>' + esc(REACHED[p.bonus.stage] || 'Prime') + '</span><b>+' + num(p.bonus.coins) + ' crédits</b>'
    + (p.bonus.packs ? '<i>+ ' + plural(p.bonus.packs, 'pack', 'packs') + ' : ' + (p.bonus.packs > 1 ? 'ils t\'attendent' : 'il t\'attend') + ' dans l\'onglet Packs.</i>'
      /* les packs de ce tour ont déjà été gagnés aujourd'hui : il reste les crédits */
      : p.bonus.capped ? '<i>' + (p.bonus.capped > 1 ? 'Les packs de ce tour sont déjà gagnés aujourd\'hui : ils reviennent' : 'Le pack de ce tour est déjà gagné aujourd\'hui : il revient') + ' à minuit.</i>' : '') + '</div>' : '';
  const game = '<div class="prize"><span>' + (p.won ? 'Manche gagnée' : 'Manche perdue') + '</span><b>+' + num(p.coins) + ' crédits</b>'
    + (p.over ? '' : '<i>' + bo(sv.format) + ' : ' + sv.wins[0] + ' – ' + sv.wins[1] + '. La série continue.</i>') + '</div>';
  if (!p.over) return { won: p.won, title: p.won ? 'Manche gagnée' : 'Manche perdue', sub: bo(sv.format) + ' · ' + sv.wins[0] + ' – ' + sv.wins[1], html: game, next: 'Manche suivante' };
  const won = !!(last && last.won), out = run.stage === 'out';
  return {
    won, title: p.title ? 'Champion du monde' : out ? 'Éliminé' : won ? 'Victoire' : 'Défaite',
    sub: (last ? STAGE[last.stage] + ' · ' + last.wins[0] + ' – ' + last.wins[1] : ''), html: game + bonus, next: 'Retour au tournoi',
  };
}

/** Joue ma prochaine rencontre : autant de drafts et de parties qu'il faut, puis retour au tableau. */
async function play(instant) {
  const S = G.S;
  if (S.busy) return;
  S.busy = true;
  try {
    let run = S.worlds.data.run, res = null;
    /* pas de draft en attente : on lance la rencontre (ou la manche suivante) */
    if (!run || !run.match || !run.series || run.series.phase !== 'draft') run = (await G.call('POST', '/api/worlds/next')).run;
    for (let guard = 0; guard < 6; guard++) {
      const n = run.next, sv = run.series;
      const out = await runDraft({
        match: run.match, cat: S.cat, fx: S.fx, toast: G.toast, help: false, instant: !!instant,
        head: 'Mondial · ' + (n ? n.label : '') + (sv.format > 1 ? ' · BO' + sv.format + (sv.fearless ? ' fearless' : '') + ' · ' + sv.wins[0] + ' – ' + sv.wins[1] : ''),
        act: async (body) => {
          res = await G.call('POST', '/api/worlds/act', { champ: body.champ, role: body.role, step: body.step, auto: body.auto });
          G.applyState(res);
          run = res.run;
          return Object.assign({ match: run.match }, run.last ? { sim: run.last.sim, report: run.last.report } : {});
        },
        resync: async () => { const fresh = (await G.call('GET', '/api/worlds')).run; if (fresh) run = fresh; return fresh ? fresh.match : null; },
      });
      if (out.left || !res || !run.last) break;
      await runMatch({ data: { match: run.last.match, report: run.last.report, sim: run.last.sim, rewards: rewardsFor(res) }, cat: S.cat, fx: S.fx });
      if (res.played.over) { if (run.status !== 'live') S.worlds.done = run; break; }
      run = (await G.call('POST', '/api/worlds/next')).run;
      res = null;
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) { S.busy = false; G.expired(); return; }
    G.toast(e instanceof ApiError ? e.message : 'Un problème est survenu.', true);
    if (!(e instanceof ApiError)) console.error(e);
  }
  S.busy = false;
  if (onView()) viewWorlds($('#main'), G); else G.refresh();
}

/** Le bandeau de l'onglet Jouer : il mène au Mondial, et dit où en est le parcours en cours. */
export function worldsBanner(S) {
  /* stage : le tour où en est mon parcours, tel que le serveur le dit avec l'écran Jouer (null : aucun parcours en cours) */
  const stage = S.play ? S.play.worlds : null;
  const text = stage ? 'Ton parcours continue : ' + (STAGE[stage] || 'tournoi en cours').toLowerCase() + '.' : 'Seize équipes, poules puis phase finale : va chercher le titre contre les meilleures équipes du monde.';
  return '<a class="wd-banner panel" href="#/jouer/mondial"><div><b>Mondial</b><span>' + text + '</span></div><span class="btn primary">' + (stage ? 'Reprendre' : 'Entrer') + '</span></a>';
}
