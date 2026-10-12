/* Fabrication d'une carte à l'écran. La même carte sert partout : collection, ouverture de pack, fiche détaillée, équipe. */
import { COACH_STATS, DDRAGON, GAME_NAME, PHOTOS, PLAYER_STATS, ROLE_LABEL } from './config.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Rend un texte inoffensif avant de l'insérer dans la page (les pseudos viennent des joueurs). */
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

/* Les versions spéciales d'une carte : même joueur, même note, mêmes statistiques, un autre habillage.
   L'identifiant d'une version est celui de la carte suivi de « ~h », « ~f » ou « ~k » (comme sur le serveur). */
export const VARIANTS = {
  holo: { suffix: '~h', name: 'Holographique', mark: 'Holo', rank: 1 },
  full: { suffix: '~f', name: 'Full art', mark: 'Full art', rank: 2 },
  /* l'édition Karmine Corp : pour ceux qui portent ou ont porté ses couleurs */
  kc: { suffix: '~k', name: 'Full art KC', mark: 'KC', rank: 3 },
};
/** Les années d'un joueur à la Karmine, telles qu'on les écrit sur sa carte : « Karmine Corp · 2023–2024 », « KC Blue · depuis 2025 ». */
export function karmineEra(cat, card) {
  const k = cat.karmine ? cat.karmine[card.base || card.id] : null;
  if (!k) return '';
  return (k[2] === 'KCB' ? 'KC Blue' : 'Karmine Corp') + ' · ' + (k[1] ? (k[0] === k[1] ? k[0] : k[0] + '–' + k[1]) : 'depuis ' + k[0]);
}
/** 0 pour une carte ordinaire, 1 pour une holographique, 2 pour une full art, 3 pour une édition KC. */
export const variantRank = (card) => (card.variant ? VARIANTS[card.variant].rank : 0);

/** Ajoute au catalogue reçu du serveur de quoi retrouver vite une carte, une équipe ou un rang, et les versions spéciales des cartes. */
export function prepare(raw) {
  const base = raw.base || raw.cards;
  raw.base = base;
  raw.cardById = new Map(base.map((c) => [c.id, c]));
  /* le serveur ne donne que la liste des cartes qui existent en version spéciale : on fabrique ces cartes ici.
     Toute carte se retrouve sous ses deux versions, même hors liste : une carte déjà obtenue ne doit jamais manquer. */
  const special = [];
  for (const [id, def] of Object.entries(VARIANTS)) {
    const listed = new Set((raw.variants && raw.variants[id]) || []);
    for (const c of base) {
      const card = Object.assign({}, c, { id: c.id + def.suffix, variant: id, base: c.id });
      raw.cardById.set(card.id, card);
      if (listed.has(c.id)) special.push(card);
    }
  }
  /* l'album : les cartes ordinaires, puis leurs versions spéciales */
  raw.cards = base.concat(special);
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
  const photo = photoUrl(card), v = card.variant || '';
  /* un nom long est écrit plus petit pour tenir sur la carte */
  const len = Math.max(7, Array.from(card.name).length);
  const load = 'loading="' + (opts.eager ? 'eager' : 'lazy') + '" decoding="async" draggable="false"';
  const picture = photo ? '<img class="card-photo" src="' + photo + '" alt="" ' + load + '>' : SILHOUETTE;
  const flag = card.country
    ? '<img class="card-flag" src="' + flagUrl(card.country) + '" alt="' + esc(cat.countries[card.country]) + '" title="' + esc(cat.countries[card.country]) + '" loading="lazy" draggable="false">'
    : '';
  return '<article class="card t' + card.tier + (card.kind === 'c' ? ' is-coach' : '') + (v ? ' v-' + v : '') + (opts.cls ? ' ' + opts.cls : '') + '" data-id="' + esc(card.id) + '">'
    + '<div class="card-in"><div class="card-face card-front">'
    + '<div class="card-bg"></div>'
    /* édition KC : le « mur bleu » ; holographique et édition KC : une feuille de métal irisée derrière le joueur, et ses paillettes */
    + (v === 'kc' ? '<div class="card-wall"></div>' : '')
    + (v === 'holo' || v === 'kc' ? '<div class="card-foil"></div><div class="card-spark"></div>' : '')
    + '<span class="card-wm">' + esc(v === 'kc' ? 'KC' : team ? team.short : '') + '</span>'
    + picture
    + '<div class="card-shade"></div>'
    + '<div class="card-side"><span class="card-ovr">' + card.ovr + '</span><span class="card-role">' + ROLE_LABEL[card.role] + '</span><i></i>'
    + flag + '<span class="card-league">' + esc(card.league) + '</span></div>'
    + '<div class="card-plate"><div class="card-name" style="--n:' + len + '">' + esc(card.name) + '</div>'
    + '<div class="card-team">' + esc(team ? team.name : card.team) + '</div>'
    + '<ul class="card-stats">' + statsOf(card).map((s) => '<li><b>' + card.stats[s[0]] + '</b><span>' + s[1] + '</span></li>').join('') + '</ul></div>'
    + '<div class="card-holo"></div><div class="card-frame"></div>'
    + (v ? '<span class="card-mark">' + VARIANTS[v].mark + '</span>' : '')
    + (v === 'kc' ? '<div class="card-glint"></div><span class="card-era">' + esc(karmineEra(cat, card)) + '</span>' : '')
    + '</div>' + (opts.back ? BACK : '') + '</div><i class="card-gem"></i></article>';
}

/** La carte s'incline sous la souris ou le doigt ; les reflets d'une carte holographique suivent le mouvement.
    Renvoie de quoi tout arrêter. */
export function tiltCard(el, max = 20) {
  const inner = el.querySelector('.card-in');
  const move = (e) => {
    const r = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    el.classList.add('tilting');
    inner.style.transform = 'rotateY(' + ((x - 0.5) * max).toFixed(1) + 'deg) rotateX(' + ((0.5 - y) * max).toFixed(1) + 'deg)';
    el.style.setProperty('--hx', (x * 100).toFixed(1) + '%');
    el.style.setProperty('--hy', (y * 100).toFixed(1) + '%');
  };
  const leave = () => { el.classList.remove('tilting'); inner.style.transform = ''; el.style.removeProperty('--hx'); el.style.removeProperty('--hy'); };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
  return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); leave(); };
}

/* une photo qui ne charge pas laisse place à la silhouette, sans icône d'image cassée */
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img && img.classList && img.classList.contains('card-photo')) img.outerHTML = SILHOUETTE;
}, true);
