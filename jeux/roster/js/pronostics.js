/* Les pronostics sur les vrais matchs (serveur : pronostics.ts), sur l'écran Packs : les prochains matchs, un toucher sur l'équipe qui
   va gagner (puis, si on veut, sur le score exact), et ses derniers résultats. Un pronostic réglé depuis la dernière visite s'annonce.
   Face à un serveur qui ne connaît pas les pronostics : rien. */
import { esc, logoHTML } from './cards.js';
import { STORE } from './config.js';

let G = null, D = null, all = false, busy = false;
const SEEN = STORE + 'pronos-vus';
const WHEN = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

export const predictionsSectionHTML = () => '<section class="pr" id="prono" hidden></section>';

export async function loadPredictions(ctx) {
  G = ctx;
  try { D = await G.call('GET', '/api/predictions'); } catch (e) { return; }
  draw();
  announce();
}

/* l'équipe : son logo quand le jeu la connaît, sinon son sigle */
const team = (t) => (logoHTML(t.code, 'pr-logo', 80) || '<span class="pr-code">' + esc(t.code) + '</span>');

function matchHTML(m) {
  const pick = m.mine ? m.mine.pick : 0, score = m.mine ? m.mine.score : '';
  const side = (k) => '<button type="button" class="pr-team' + (pick === k + 1 ? ' on' : '') + '" data-pick="' + (k + 1) + '" title="' + esc(m.teams[k].name) + '">' + team(m.teams[k]) + '<b>' + esc(m.teams[k].code) + '</b></button>';
  /* les scores qui vont avec l'équipe choisie */
  const scores = pick && m.scores.length ? m.scores.filter((s) => { const [a, b] = s.split('-').map(Number); return pick === 1 ? a > b : b > a; }) : [];
  return '<div class="pr-match" data-match="' + esc(m.id) + '"><div class="pr-meta"><span>' + esc(m.leagueName) + (m.block ? ' · ' + esc(m.block) : '') + ' · Bo' + m.bestOf + '</span><time>' + esc(WHEN.format(m.start)) + '</time></div>'
    + '<div class="pr-vs">' + side(0) + '<i>contre</i>' + side(1) + '</div>'
    + (scores.length ? '<div class="pr-scores"><span>Score exact (+' + D.prize.exact + ') :</span>' + scores.map((s) => '<button type="button" class="pr-score' + (score === s ? ' on' : '') + '" data-score="' + s + '">' + s + '</button>').join('') + '</div>' : '')
    + '</div>';
}
function pastHTML(m) {
  const good = m.reward > 0, open = m.reward === null || m.reward === undefined;
  return '<li class="' + (open ? 'open' : good ? 'good' : 'bad') + '"><span>' + esc(m.teams[0].code) + ' ' + (m.state === 'completed' ? m.teams[0].wins + '-' + m.teams[1].wins : 'contre') + ' ' + esc(m.teams[1].code)
    + ' · ton choix : <b>' + esc(m.teams[m.mine.pick - 1].code) + (m.mine.score ? ' ' + esc(m.mine.score) : '') + '</b></span><em>' + (open ? 'en attente' : good ? '+' + m.reward + ' crédits' : 'raté') + '</em></li>';
}

/* les matchs en cours (serveur récent : D.live) */
const liveHTML = () => ((D.live || []).length ? '<div class="pr-live">' + D.live.map((m) => '<p><span class="pr-dot" aria-hidden="true"></span><b>En direct</b><span>' + esc(m.leagueName) + ' · '
  + esc(m.teams[0].code) + ' <strong>' + m.teams[0].wins + '-' + m.teams[1].wins + '</strong> ' + esc(m.teams[1].code) + '</span></p>').join('') + '</div>' : '');
/* les prochains matchs dont une équipe reste à connaître (serveur récent : D.soon) : un par ligne quand l'une des deux est connue, les
   autres comptés ensemble, par compétition */
const code = (t) => (t.code === 'TBD' ? '?' : esc(t.code));
function soonHTML() {
  const soon = D.soon || [];
  if (!soon.length) return '';
  const half = soon.filter((m) => m.teams.some((t) => t.code !== 'TBD')).slice(0, 3);
  const blind = new Map();
  for (const m of soon.filter((x) => x.teams.every((t) => t.code === 'TBD'))) {
    const g = blind.get(m.leagueName) || { n: 0, start: m.start };
    g.n++;
    blind.set(m.leagueName, g);
  }
  /* par heure */
  const lines = half.map((m) => ({ at: m.start, html: '<li><span>' + esc(m.leagueName) + ' · ' + code(m.teams[0]) + ' contre ' + code(m.teams[1]) + '</span><time>' + esc(WHEN.format(m.start)) + '</time></li>' }))
    .concat([...blind].map(([league, g]) => ({ at: g.start, html: '<li><span>' + esc(league) + ' · ' + g.n + ' match' + (g.n > 1 ? 's' : '') + ', équipes à venir</span><time>dès ' + esc(WHEN.format(g.start)) + '</time></li>' })))
    .sort((a, b) => a.at - b.at);
  return '<h3 class="pr-h3">Bientôt</h3><ul class="pr-soon">' + lines.map((l) => l.html).join('')
    + '</ul><p class="pr-note">Ils s\'ouvrent aux pronostics dès que les deux équipes sont connues.</p>';
}

function draw() {
  const el = document.getElementById('prono');
  if (!el || !D) return;
  const list = all ? D.upcoming : D.upcoming.slice(0, 4);
  el.hidden = false;
  el.innerHTML = '<h2 class="h2">Pronostics</h2>'
    /* sur ordinateur, le match en direct se tient à droite de la présentation (habillage.css, .pr-head) */
    + '<div class="pr-head"><p class="ms-sub">Trouve le vainqueur d\'un vrai match pro : +' + D.prize.win + ' crédits, et +' + D.prize.exact + ' si le score est exact. ' + D.perDay + ' pronostics au plus par jour de matchs.</p>' + liveHTML() + '</div>'
    + (list.length ? '<div class="pr-list">' + list.map(matchHTML).join('') + '</div>'
      + (D.upcoming.length > 4 ? '<button type="button" class="btn slim pr-more" id="prMore">' + (all ? 'Moins de matchs' : 'Tous les matchs de la semaine (' + D.upcoming.length + ')') + '</button>' : '')
      : '<p class="empty">Aucun match à pronostiquer pour l\'instant' + ((D.soon || []).length ? '.' : ' : les prochains apparaîtront dès que leurs équipes seront connues.') + '</p>')
    + soonHTML()
    + (D.past.length ? '<h3 class="pr-h3">Mes derniers pronostics</h3><ul class="pr-past">' + D.past.map(pastHTML).join('') + '</ul>' : '')
    + (D.totals.settled ? '<p class="pr-total"><b>' + D.totals.good + '</b> bon' + (D.totals.good > 1 ? 's' : '') + ' pronostic' + (D.totals.good > 1 ? 's' : '') + ' sur ' + D.totals.settled + ' · <b>' + D.totals.won + '</b> crédits gagnés</p>' : '');
}
/* les pronostics réglés depuis la dernière visite, sur cet appareil : un mot */
function announce() {
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(SEEN) || 'null'); } catch (e) { seen = null; }
  const settled = D.past.filter((m) => m.reward !== null && m.reward !== undefined);
  try { localStorage.setItem(SEEN, JSON.stringify(settled.map((m) => m.id))); } catch (e) { /* tant pis */ }
  if (!Array.isArray(seen)) return;
  const fresh = settled.filter((m) => !seen.includes(m.id) && m.reward > 0);
  if (fresh.length) G.toast((fresh.length > 1 ? fresh.length + ' pronostics gagnés' : 'Pronostic gagné') + ' : +' + fresh.reduce((s, m) => s + m.reward, 0) + ' crédits');
}

async function send(id, pick, score) {
  if (busy) return;
  busy = true;
  const res = await G.guard(() => G.call('POST', '/api/predictions', { match: id, pick, score }));
  busy = false;
  if (!res) return;
  D = res;
  G.sfx.click();
  draw();
}
document.addEventListener('click', (e) => {
  if (!G || !D || !e.target.closest('#prono')) return;
  if (e.target.closest('#prMore')) { all = !all; draw(); return; }
  const box = e.target.closest('[data-match]');
  if (!box) return;
  const m = D.upcoming.find((x) => x.id === box.dataset.match);
  if (!m) return;
  const p = e.target.closest('[data-pick]'), s = e.target.closest('[data-score]');
  if (p) send(m.id, Number(p.dataset.pick), '');
  else if (s && m.mine) send(m.id, m.mine.pick, m.mine.score === s.dataset.score ? '' : s.dataset.score);
});
