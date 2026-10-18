/* Le pronostic du tableau final des Worlds et le classement des pronostiqueurs (serveur : tableau.ts), en tête de Packs › Vrais matchs.
   Avant les quarts : une annonce. Dès qu'ils sont connus : le tableau à remplir — le vainqueur de chaque quart, puis de chaque demie
   (entre les vainqueurs choisis), puis le champion — retouchable jusqu'au premier quart. Ensuite : mon tableau, coché au fil des matchs.
   Face à un serveur qui ne connaît pas le tableau : rien. */
import { esc, logoHTML } from './cards.js';

let G = null, D = null, draft = null, busy = false, wide = false;
const WHEN = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const num = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export const bracketSectionHTML = () => '<section class="tb" id="tableau" hidden></section>';

export async function loadBracket(ctx) {
  G = ctx;
  try { D = await G.call('GET', '/api/tableau'); } catch (e) { return; }
  draft = D.mine ? { qf: [...D.mine.qf], sf: [...D.mine.sf], champion: D.mine.champion } : { qf: [null, null, null, null], sf: [null, null], champion: null };
  draw();
}

const logo = (code) => logoHTML(code, 'pr-logo', 80) || '<span class="pr-code">' + esc(code || '?') + '</span>';
const nameOf = (code) => { for (const m of D.quarters) for (const t of m.teams) if (t.code === code) return t.name; return code; };
/* un bouton d'équipe : choisi ou non ; sans équipe (le vainqueur d'avant pas encore choisi) : un « ? » */
const pickBtn = (code, on, attrs) => (code
  ? '<button type="button" class="pr-team tb-team' + (on ? ' on' : '') + '" ' + attrs + ' title="' + esc(nameOf(code)) + '">' + logo(code) + '<b>' + esc(code) + '</b></button>'
  : '<span class="pr-team tb-team tb-empty"><span class="pr-code">?</span><b>À choisir</b></span>');
const same = () => D.mine && D.mine.champion === draft.champion && D.mine.qf.join() === draft.qf.join() && D.mine.sf.join() === draft.sf.join();
const complete = () => draft.qf.every(Boolean) && draft.sf.every(Boolean) && !!draft.champion;

function rulesHTML() {
  const R = D.rewards;
  return '<p class="ms-sub">Devine tout le tableau final : <b>+' + R.semi + '</b> par demi-finaliste trouvé, <b>+' + R.final + '</b> par finaliste, <b>+' + num(R.champion) + '</b> pour le champion'
    + ', et <b>+' + num(R.perfect) + '</b> avec le titre « Oracle des Worlds 2026 » pour un tableau parfait.</p>';
}

/* le tableau à remplir */
function openHTML() {
  const q = D.quarters, sfTeams = [[draft.qf[0], draft.qf[1]], [draft.qf[2], draft.qf[3]]];
  const row = (label, when, a, b) => '<div class="tb-row"><div class="pr-meta"><span>' + label + '</span>' + (when ? '<time>' + esc(WHEN.format(when)) + '</time>' : '') + '</div><div class="pr-vs">' + a + '<i>contre</i>' + b + '</div></div>';
  return '<div class="tb-grid">'
    + '<div class="tb-col"><h3 class="pr-h3">Quarts de finale</h3>' + q.map((m, i) => row('Quart ' + (i + 1), m.start,
      pickBtn(m.teams[0].code, draft.qf[i] === m.teams[0].code, 'data-qf="' + i + '" data-code="' + esc(m.teams[0].code) + '"'),
      pickBtn(m.teams[1].code, draft.qf[i] === m.teams[1].code, 'data-qf="' + i + '" data-code="' + esc(m.teams[1].code) + '"'))).join('') + '</div>'
    + '<div class="tb-col"><h3 class="pr-h3">Demi-finales</h3>' + sfTeams.map((t, i) => row('Demie ' + (i + 1) + ' · vainqueurs des quarts ' + (2 * i + 1) + ' et ' + (2 * i + 2), D.semis[i] && D.semis[i].start,
      pickBtn(t[0], t[0] && draft.sf[i] === t[0], 'data-sf="' + i + '" data-code="' + esc(t[0] || '') + '"'),
      pickBtn(t[1], t[1] && draft.sf[i] === t[1], 'data-sf="' + i + '" data-code="' + esc(t[1] || '') + '"'))).join('')
    + '<h3 class="pr-h3">Finale</h3>' + row('Le champion', D.final && D.final.start,
      pickBtn(draft.sf[0], draft.sf[0] && draft.champion === draft.sf[0], 'data-champ="' + esc(draft.sf[0] || '') + '"'),
      pickBtn(draft.sf[1], draft.sf[1] && draft.champion === draft.sf[1], 'data-champ="' + esc(draft.sf[1] || '') + '"'))
    + '<div class="tb-save"><p>' + (draft.champion ? 'Ton champion : <b>' + esc(nameOf(draft.champion)) + '</b>. ' : '') + 'Modifiable jusqu\'au premier quart, ' + esc(WHEN.format(D.lockAt)) + '.</p>'
    + '<button type="button" class="btn primary" id="tbSave"' + (complete() && !same() ? '' : ' disabled') + '>' + (same() ? 'Tableau enregistré ✓' : D.mine ? 'Enregistrer les changements' : 'Valider mon tableau') + '</button></div>'
    + '</div></div>';
}

/* mon tableau, une fois le premier quart commencé : chaque choix coché au fil des matchs */
function lockedHTML() {
  const m = D.mine;
  if (!m) return '<p class="empty">Le tableau est fermé depuis le premier quart de finale : tu n\'en as pas rempli. Rendez-vous l\'an prochain !</p>';
  const qw = D.quarters.map((x) => x.winner), sw = D.semis.map((x) => x.winner).filter(Boolean), champ = D.final ? D.final.winner : null;
  /* les équipes déjà éliminées (un quart ou une demie perdus) : leurs choix suivants sont ratés sans attendre */
  const out = new Set([...D.quarters, ...D.semis, ...(D.final ? [D.final] : [])].filter((x) => x.winner).map((x) => x.teams.find((t) => t.code !== x.winner).code));
  const mark = (ok, known) => (!known ? '<em>en attente</em>' : ok ? '<em class="good">✓</em>' : '<em class="bad">✗</em>');
  const li = (label, code, ok, known) => '<li class="' + (!known ? 'open' : ok ? 'good' : 'bad') + '"><span>' + label + ' : <b>' + esc(code) + '</b></span>' + mark(ok, known) + '</li>';
  const stage = (v) => (v === null || v === undefined ? '' : ' · <b>' + (v > 0 ? '+' + num(v) + ' crédits' : 'rien') + '</b>');
  return '<h3 class="pr-h3">Mes demi-finalistes' + stage(m.rewards.semi) + '</h3><ul class="pr-past">' + m.qf.map((c, i) => li('Quart ' + (i + 1), c, c === qw[i], !!qw[i])).join('') + '</ul>'
    + '<h3 class="pr-h3">Mes finalistes' + stage(m.rewards.final) + '</h3><ul class="pr-past">' + m.sf.map((c, i) => li('Demie ' + (i + 1), c, sw.includes(c), sw.includes(c) || out.has(c))).join('') + '</ul>'
    + '<h3 class="pr-h3">Mon champion' + stage(m.rewards.champion) + '</h3><ul class="pr-past">' + li('Champion', m.champion, m.champion === champ, !!champ || out.has(m.champion)) + '</ul>'
    + (m.perfect ? '<p class="pr-total"><b>Tableau parfait !</b> Le titre « Oracle des Worlds 2026 » est sur ton profil.</p>' : '');
}

/* le classement des pronostiqueurs des Worlds */
function boardHTML() {
  const B = D.board, top = wide ? B.top : B.top.slice(0, 5);
  if (!top.length && !B.me) return '';
  return '<h3 class="pr-h3">Meilleurs pronostiqueurs des Worlds</h3><ol class="tb-board">'
    + top.map((p, i) => '<li' + (p.me ? ' class="me"' : '') + '><span class="tb-rank">' + (i + 1) + '</span><span class="tb-name">' + esc(p.name) + '</span><span class="tb-good">' + (p.good ? p.good + ' bon' + (p.good > 1 ? 's' : '') + ' prono' + (p.good > 1 ? 's' : '') : '') + '</span><b>' + num(p.won) + '</b></li>').join('')
    + '</ol>'
    + (B.top.length > 5 ? '<button type="button" class="btn slim pr-more" id="tbWide">' + (wide ? 'Les cinq premiers' : 'Les dix premiers') + '</button>' : '')
    + (B.me && !top.some((p) => p.me) ? '<p class="pr-total">Ta place : <b>' + B.me.rank + '<sup>e</sup></b> sur ' + B.me.total + ' · <b>' + num(B.me.won) + '</b> crédits gagnés</p>' : '')
    + '<p class="pr-note">Crédits gagnés aux pronostics des Worlds (vainqueur, score, joueur du match) et au tableau final.</p>';
}

function draw() {
  const el = document.getElementById('tableau');
  if (!el || !D) return;
  el.hidden = false;
  const head = '<h2 class="h2">Tableau final des Worlds</h2>';
  const body = D.phase === 'soon'
    ? rulesHTML() + '<p class="tb-soon">Il s\'ouvre dès que les quatre quarts de finale sont connus, à la fin du Système suisse' + (D.quarters[0] ? ' (premier quart : ' + esc(WHEN.format(D.quarters[0].start)) + ')' : '') + '.</p>'
    : D.phase === 'open' ? rulesHTML() + openHTML()
    : lockedHTML();
  el.innerHTML = head + body + boardHTML();
}

async function save() {
  if (busy || !complete()) return;
  busy = true;
  const res = await G.guard(() => G.call('POST', '/api/tableau', { qf: draft.qf, sf: draft.sf, champion: draft.champion }));
  busy = false;
  if (!res) return;
  D = res;
  G.sfx.click();
  G.toast('Tableau enregistré : ton champion, ' + nameOf(draft.champion) + '.');
  draw();
}

document.addEventListener('click', (e) => {
  if (!G || !D || !e.target.closest('#tableau')) return;
  if (e.target.closest('#tbWide')) { wide = !wide; draw(); return; }
  if (e.target.closest('#tbSave')) { save(); return; }
  if (D.phase !== 'open') return;
  const q = e.target.closest('[data-qf]'), s = e.target.closest('[data-sf]'), c = e.target.closest('[data-champ]');
  if (q) {
    const i = Number(q.dataset.qf), old = draft.qf[i];
    draft.qf[i] = q.dataset.code;
    /* l'équipe remplacée ne va plus en demie (ni plus loin) */
    const k = i < 2 ? 0 : 1;
    if (old && old !== draft.qf[i] && draft.sf[k] === old) { draft.sf[k] = null; if (draft.champion === old) draft.champion = null; }
  } else if (s && s.dataset.code) {
    const i = Number(s.dataset.sf), old = draft.sf[i];
    draft.sf[i] = s.dataset.code;
    if (old && old !== draft.sf[i] && draft.champion === old) draft.champion = null;
  } else if (c && c.dataset.champ) draft.champion = c.dataset.champ;
  else return;
  G.sfx.click();
  draw();
});
