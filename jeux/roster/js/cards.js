/* Fabrication d'une carte à l'écran. La même carte sert partout : collection, ouverture de pack, fiche détaillée. */
import { COACH_STATS, DDRAGON, GAME_NAME, PLAYER_STATS, ROLE_LABEL } from './config.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Rend un texte inoffensif avant de l'insérer dans la page (les pseudos viennent des joueurs). */
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

/** Ajoute au catalogue reçu du serveur de quoi retrouver vite une carte, une équipe ou un rang. */
export function prepare(raw) {
  raw.cardById = new Map(raw.cards.map((c) => [c.id, c]));
  raw.teamById = new Map(raw.teams.map((t) => [t.id, t]));
  raw.tierById = new Map(raw.tiers.map((t) => [t.id, t]));
  return raw;
}

export const artUrl = (card) => (card.art ? DDRAGON + '/img/champion/loading/' + card.art + '.jpg' : null);
export const iconUrl = (cat, champId) => DDRAGON + '/' + cat.ddragon + '/img/champion/' + champId + '.png';
export const flagUrl = (code) => 'drapeaux/' + code.toLowerCase() + '.svg';
export const statsOf = (card) => (card.kind === 'c' ? COACH_STATS : PLAYER_STATS);

const BACK = '<div class="card-face card-back"><div class="card-body">'
  + '<svg class="back-mark" viewBox="0 0 100 100" aria-hidden="true"><use href="#mark"/></svg>'
  + '<span class="back-word">' + GAME_NAME + '</span></div></div>';

/** opts : back (ajoute le dos, pour pouvoir la retourner), eager (image chargée tout de suite), cls (classes en plus). */
export function cardHTML(card, cat, opts = {}) {
  const team = cat.teamById.get(card.team);
  const tier = cat.tierById.get(card.tier);
  const art = artUrl(card);
  /* un nom long est écrit plus petit pour tenir sur la carte */
  const len = Math.max(7, Array.from(card.name).length);
  const picture = art
    ? '<img class="card-art" src="' + art + '" alt="" loading="' + (opts.eager ? 'eager' : 'lazy') + '" decoding="async" draggable="false">'
    : '<svg class="card-art card-art-svg" viewBox="0 0 250 350" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><use href="#art-' + (card.kind === 'c' ? 'coach' : 'none') + '"/></svg>';
  const flag = card.country
    ? '<img class="card-flag" src="' + flagUrl(card.country) + '" alt="' + esc(cat.countries[card.country]) + '" title="' + esc(cat.countries[card.country]) + '" loading="lazy" draggable="false">'
    : '';
  return '<article class="card t' + card.tier + (card.kind === 'c' ? ' is-coach' : '') + (opts.cls ? ' ' + opts.cls : '') + '" data-id="' + esc(card.id) + '">'
    + '<div class="card-in"><div class="card-face card-front"><div class="card-body">'
    + picture
    + '<div class="card-shade"></div><div class="card-holo"></div>'
    + '<div class="card-top"><div class="card-rate"><div class="card-ovr">' + card.ovr + '</div><div class="card-role">' + ROLE_LABEL[card.role] + '</div></div>'
    + '<div class="card-tags">' + flag + '<span class="card-league">' + esc(card.league) + '</span></div></div>'
    + '<div class="card-id"><div class="card-name" style="--n:' + len + '">' + esc(card.name) + '</div>'
    + '<div class="card-team">' + esc(team ? team.name : card.team) + '</div></div>'
    + '<ul class="card-stats">' + statsOf(card).map((s) => '<li><b>' + card.stats[s[0]] + '</b><span>' + s[1] + '</span></li>').join('') + '</ul>'
    + '<div class="card-foot"><span>' + esc(tier.name) + '</span><span>' + cat.season + '</span></div>'
    + '</div></div>' + (opts.back ? BACK : '') + '</div></article>';
}
