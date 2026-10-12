/* Les parties en ligne, sur l'écran Jouer : la partie rapide (l'équipe d'un autre joueur, dirigée par l'ordinateur) et le classé
   (file d'attente, rangs, classement). Le serveur choisit l'adversaire, tient la file et compte les points de ligue ; ici on affiche.
   Un serveur plus ancien ne les connaît pas (le joueur n'a pas de rang) : rien ne s'affiche alors. */
import { esc } from './cards.js';
import { num, openSheet, plural, sheetTitle } from './ui.js';

/* G : ce que l'application prête — S (état), call, guard, duel (quick, ranked) */
let G = null;
/* une couleur par rang : Fer, Bronze, Argent, Or, Platine, Émeraude, Diamant, puis Maître, Grand Maître, Challenger */
const TIER_COLOR = ['#8a93a0', '#b08660', '#b7c3cf', '#d9b45a', '#4fd1c5', '#3ddc97', '#8fd0ff', '#c58bff', '#ff7a7a', '#ffe7a8'];
/** L'emblème d'un rang : un losange à sa couleur ; dessous, un point par division franchie (III : un, II : deux, I : trois). */
export const emblemHTML = (rank, cls) => '<i class="rk-em' + (cls ? ' ' + cls : '') + '" style="--rc:' + TIER_COLOR[rank.tier] + '" aria-hidden="true"><b></b>'
  + (rank.division ? '<span>' + '<u></u>'.repeat(4 - rank.division) + '</span>' : '') + '</i>';
/** Ce qui se dit de la file d'attente du classé, d'après le nombre de joueurs qui y cherchent une partie. */
export const queueText = (n) => (n ? plural(n, 'joueur cherche', 'joueurs cherchent') + ' une partie en ce moment' : 'Personne dans la file pour l\'instant');
const points = (R) => (R.rank.next ? R.rank.points + ' / ' + R.rank.next + ' points' : num(R.lp) + ' points');
const progress = (rank) => (rank.next ? Math.round((100 * rank.points) / rank.next) : 100);
/** Le rang d'un joueur, en un bloc : emblème, nom du rang, points, bilan, avancée vers la division suivante. */
const rankHTML = (R, cls) => '<div class="rk' + (cls ? ' ' + cls : '') + '">' + emblemHTML(R.rank) + '<div class="rk-t"><b>' + esc(R.rank.label) + '</b><span>' + points(R) + ' · ' + R.wins + ' V – ' + R.losses + ' D</span>'
  + '<span class="bar"><i style="width:' + progress(R.rank) + '%"></i></span></div></div>';

/** La section « En ligne » de l'écran Jouer (vide si le serveur ne propose pas ces parties). */
export function onlineHTML(ctx) {
  G = ctx;
  const S = G.S, R = S.player.ranked;
  if (!R) return '';
  const waiting = S.pulse && S.pulse.ranked ? S.pulse.ranked.waiting : 0;
  return '<section class="online-play" id="onlinePlay"><h2 class="h2">En ligne</h2><div class="on-grid">'
    + '<article class="on-card panel"><header><span class="label">Partie rapide</span></header>'
    + '<p>Affronte l\'équipe d\'un autre joueur, tirée au hasard parmi celles de ton niveau. L\'ordinateur la dirige : son propriétaire n\'a pas besoin d\'être là.</p>'
    + '<div class="on-foot"><button class="btn primary" type="button" id="quickGo">Trouver un adversaire</button><span class="on-note">Une manche · la récompense d\'un match</span></div></article>'
    + '<article class="on-card panel"><header><span class="label">Classé</span><button class="on-link" type="button" id="ladderGo">Classement ›</button></header>'
    + rankHTML(R)
    + '<p>Une manche en direct contre un joueur de ton rang. La victoire fait monter tes points de ligue, la défaite les fait descendre.</p>'
    + '<div class="on-foot"><button class="btn primary" type="button" id="rankedGo">Chercher une partie</button><span class="on-note" id="rankedWait">' + queueText(waiting) + '</span></div></article>'
    + '</div></section>';
}
/** Branche les boutons de la section (après l'avoir écrite dans la page). */
export function bindOnline(root) {
  const quick = root.querySelector('#quickGo');
  if (!quick || !G) return;
  quick.addEventListener('click', () => G.duel.quick());
  root.querySelector('#rankedGo').addEventListener('click', () => G.duel.ranked());
  root.querySelector('#ladderGo').addEventListener('click', openLadder);
}

/** Le classement : mon rang, l'échelle des rangs, les vingt premiers, les règles. */
async function openLadder() {
  const data = await G.guard(() => G.call('GET', '/api/ranked'));
  if (!data) return;
  const L = data.ladder, me = data.me;
  const scale = L.tiers.map((name, t) => [name, t * L.divisions * L.step]).concat([['Maître', L.master], ['Grand Maître', L.grandmaster], ['Challenger', L.challenger]]);
  const row = (p, i) => '<tr' + (p.id === G.S.player.id ? ' class="me"' : '') + '><td>' + (i + 1) + '</td><td><b>' + esc(p.name) + '</b><small class="show-s">' + esc(p.rank.label) + ' · ' + num(p.lp) + ' points · ' + p.wins + ' V – ' + p.losses + ' D</small></td>'
    + '<td class="hide-s"><span class="rk-tag" style="--rc:' + TIER_COLOR[p.rank.tier] + '"><i></i>' + esc(p.rank.label) + '</span></td><td class="num hide-s">' + num(p.lp) + '</td><td class="num hide-s">' + p.wins + ' – ' + p.losses + '</td></tr>';
  openSheet(sheetTitle('Classé', me.place ? me.place + (me.place === 1 ? 'er' : 'e') + ' du classement' : 'Joue une partie classée pour entrer au classement')
    + rankHTML(me, 'big')
    + '<div class="rk-scale">' + scale.map(([name, from], t) => '<span class="' + (t === me.rank.tier ? 'on' : t < me.rank.tier ? 'done' : '') + '" style="--rc:' + TIER_COLOR[t] + '"><i></i><b>' + name + '</b><em>' + num(from) + '</em></span>').join('') + '</div>'
    + (data.top.length ? '<table class="board rk-board"><thead><tr><th>#</th><th>Joueur</th><th class="hide-s">Rang</th><th class="num hide-s">Points</th><th class="num hide-s">V – D</th></tr></thead><tbody>' + data.top.map(row).join('') + '</tbody></table>'
      : '<p class="empty">Personne n\'a encore joué de partie classée. À toi d\'ouvrir le classement.</p>')
    + '<p class="note">Une victoire rapporte ' + L.win + ' points face à un joueur à égalité, une défaite en coûte ' + L.loss + ' ; battre plus fort que soi rapporte davantage (jusqu\'à ' + (L.win + L.swing) + '), et perdre contre lui coûte moins. '
    + 'Draft en direct, ' + data.turn + ' secondes par choix. Quitter une partie classée, c\'est la perdre.</p>',
    { cls: 'ladder', label: 'Classé' });
}
