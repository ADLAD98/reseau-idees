/* Fabrication d'une carte à l'écran. La même carte sert partout : collection, ouverture de pack, fiche détaillée, équipe. */
import { COACH_STATS, DDRAGON, GAME_NAME, PHOTOS, PLAYER_STATS, ROLE_LABEL } from './config.js';

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

/** Photo officielle du joueur (hébergée par Leaguepedia), à la largeur demandée. */
export const photoUrl = (card, width) => (card.photo ? PHOTOS + card.photo + '/revision/latest/scale-to-width-down/' + (width || 440) : null);
export const champName = (cat, id) => (cat.champions[id] ? cat.champions[id].n : id);
export const iconUrl = (cat, champId) => DDRAGON + '/' + cat.ddragon + '/img/champion/' + champId + '.png';
export const flagUrl = (code) => 'drapeaux/' + code.toLowerCase() + '.svg';
export const statsOf = (card) => (card.kind === 'c' ? COACH_STATS : PLAYER_STATS);

const BACK = '<div class="card-face card-back"><svg class="back-mark" viewBox="0 0 100 100" aria-hidden="true"><use href="#mark"/></svg>'
  + '<span class="back-word">' + GAME_NAME + '</span><div class="card-frame"></div></div>';
/* silhouette affichée quand une carte n'a pas de photo, ou que la photo ne se charge pas */
const SILHOUETTE = '<svg class="card-ph" viewBox="0 0 100 100" aria-hidden="true"><use href="#silhouette"/></svg>';

/** opts : back (ajoute le dos, pour pouvoir la retourner), eager (image chargée tout de suite), cls (classes en plus). */
export function cardHTML(card, cat, opts = {}) {
  const team = cat.teamById.get(card.team);
  const photo = photoUrl(card);
  /* un nom long est écrit plus petit pour tenir sur la carte */
  const len = Math.max(7, Array.from(card.name).length);
  const picture = photo
    ? '<img class="card-photo" src="' + photo + '" alt="" loading="' + (opts.eager ? 'eager' : 'lazy') + '" decoding="async" draggable="false">'
    : SILHOUETTE;
  const flag = card.country
    ? '<img class="card-flag" src="' + flagUrl(card.country) + '" alt="' + esc(cat.countries[card.country]) + '" title="' + esc(cat.countries[card.country]) + '" loading="lazy" draggable="false">'
    : '';
  return '<article class="card t' + card.tier + (card.kind === 'c' ? ' is-coach' : '') + (opts.cls ? ' ' + opts.cls : '') + '" data-id="' + esc(card.id) + '">'
    + '<div class="card-in"><div class="card-face card-front">'
    + '<div class="card-bg"></div><span class="card-wm">' + esc(team ? team.short : '') + '</span>'
    + picture
    + '<div class="card-shade"></div>'
    + '<div class="card-side"><span class="card-ovr">' + card.ovr + '</span><span class="card-role">' + ROLE_LABEL[card.role] + '</span><i></i>'
    + flag + '<span class="card-league">' + esc(card.league) + '</span></div>'
    + '<div class="card-plate"><div class="card-name" style="--n:' + len + '">' + esc(card.name) + '</div>'
    + '<div class="card-team">' + esc(team ? team.name : card.team) + '</div>'
    + '<ul class="card-stats">' + statsOf(card).map((s) => '<li><b>' + card.stats[s[0]] + '</b><span>' + s[1] + '</span></li>').join('') + '</ul></div>'
    + '<div class="card-holo"></div><div class="card-frame"></div>'
    + '</div>' + (opts.back ? BACK : '') + '</div><i class="card-gem"></i></article>';
}

/* une photo qui ne charge pas laisse place à la silhouette, sans icône d'image cassée */
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img && img.classList && img.classList.contains('card-photo')) img.outerHTML = SILHOUETTE;
}, true);
