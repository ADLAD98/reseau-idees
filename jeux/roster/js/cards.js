/* Fabrication d'une carte à l'écran. La même carte sert partout : collection, ouverture de pack, fiche détaillée, équipe. */
import { COACH_STATS, DDRAGON, GAME_NAME, PHOTOS, PLAYER_STATS, PRESTIGE_TEAMS, ROLE_LABEL } from './config.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Rend un texte inoffensif avant de l'insérer dans la page (les pseudos viennent des joueurs). */
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

/* Les versions spéciales d'une carte : même joueur, même note, mêmes statistiques, un autre habillage.
   L'identifiant d'une version est celui de la carte suivi de « ~h », « ~f », « ~k » ou « ~l » (comme sur le serveur).
   Seule l'édition légendaire change la note et les statistiques : c'est le serveur qui les donne. */
export const VARIANTS = {
  holo: { suffix: '~h', name: 'Holographique', mark: 'Holo', rank: 1 },
  full: { suffix: '~f', name: 'Full art', mark: 'Full art', rank: 2 },
  /* l'édition Karmine Corp : pour ceux qui portent ou ont porté ses couleurs */
  kc: { suffix: '~k', name: 'Full art KC', mark: 'KC', rank: 3 },
  /* l'édition légendaire : un full art « diamant », avec sa propre note et tous les trophées mondiaux du joueur */
  legend: { suffix: '~l', name: 'Légendaire', mark: 'Légende', rank: 4 },
};
/** Les années d'un joueur à la Karmine, telles qu'on les écrit sur sa carte : « Karmine Corp · 2023–2024 », « KC Blue · depuis 2025 ». */
export function karmineEra(cat, card) {
  const k = cat.karmine ? cat.karmine[card.base || card.id] : null;
  if (!k) return '';
  return (k[2] === 'KCB' ? 'KC Blue' : 'Karmine Corp') + ' · ' + (k[1] ? (k[0] === k[1] ? k[0] : k[0] + '–' + k[1]) : 'depuis ' + k[0]);
}
/** Le prestige d'une carte : 2 pour un joueur ou un coach titré aux Worlds ou au MSI, 1 pour une carte d'un grand club, 0 sinon. */
export const prestigeOf = (card) => (card.titles && card.titles[0] + card.titles[1] > 0 ? 2 : PRESTIGE_TEAMS.includes(card.team) ? 1 : 0);
/** 0 pour une carte ordinaire, 1 pour une holographique, 2 pour une full art, 3 pour une édition KC, 4 pour une légendaire. */
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
      /* l'édition légendaire n'existe que pour les légendes : elle a sa note, son rang et ses statistiques */
      const legend = id === 'legend' ? raw.legends && raw.legends[c.id] : null;
      if (id === 'legend' && !legend) continue;
      const card = Object.assign({}, c, legend ? { ovr: legend.ovr, tier: legend.tier, stats: legend.stats } : null, { id: c.id + def.suffix, variant: id, base: c.id });
      /* sur sa carte KC, le joueur porte le maillot de la Karmine : sa photo de l'époque, quand il y en a une */
      const era = id === 'kc' && raw.karmine ? raw.karmine[c.id] : null;
      if (era && era[3]) card.photo = era[3];
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

/* Le dos, le même pour toutes les cartes : un médaillon gravé autour de la marque du jeu (deux cercles et leurs soixante graduations,
   deux losanges, un cœur plein), des axes, deux filets qui suivent la silhouette. Le tout en dorure, sur un fond guilloché. */
const BACK = '<div class="card-face card-back"><svg class="back-art" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">'
  + '<g fill="none" stroke="url(#cardGold)">'
  + '<path stroke-width=".42" d="M10.9 7H89.1L93 10.9V125.15L50 132.9 7 125.15V10.9Z"/><path stroke-width=".2" d="M12.3 9.3H87.7L90.7 12.3V123.4L50 130.7 9.3 123.4V12.3Z"/>'
  + '<circle cx="50" cy="62" r="27.5" stroke-width=".5"/><circle cx="50" cy="62" r="24.2" stroke-width=".22"/><circle cx="50" cy="62" r="25.85" stroke-width="1.5" stroke-dasharray=".32 2.387"/>'
  + '<path stroke-width=".62" d="M50 41 71 62 50 83 29 62Z"/><path stroke-width=".28" d="M50 46.5 65.5 62 50 77.5 34.5 62Z"/><path stroke-width=".22" d="M35.2 47.2H64.8V76.8H35.2Z"/>'
  + '<path stroke-width=".28" d="M50 9.3V34.5M50 89.5V96.6M9.3 62H22.5M77.5 62H90.7"/>'
  + '<path stroke-width=".28" d="M30 100H47M53 100H70"/></g>'
  + '<g fill="url(#cardGold)" stroke="none"><path d="M50 55.5 56.5 62 50 68.5 43.5 62Z"/>'
  + '<path d="M50 19 52.6 21.6 50 24.2 47.4 21.6ZM50 32.9 51.6 34.5 50 36.1 48.4 34.5ZM50 87.9 51.6 89.5 50 91.1 48.4 89.5ZM20.9 62 22.5 60.4 24.1 62 22.5 63.6ZM75.9 62 77.5 60.4 79.1 62 77.5 63.6Z'
  + 'M50 98.3 51.7 100 50 101.7 48.3 100ZM50 122.3 51.9 124.2 50 126.1 48.1 124.2Z"/></g></svg>'
  + '<span class="back-word">' + GAME_NAME + '</span><span class="back-sub">Cartes e-sport</span><div class="card-frame"></div></div>';
/* silhouette affichée quand une carte n'a pas de photo, ou que la photo ne se charge pas */
const SILHOUETTE = '<svg class="card-ph" viewBox="0 0 100 100" aria-hidden="true"><use href="#silhouette"/></svg>';

/** opts : back (ajoute le dos, pour pouvoir la retourner), eager (image chargée tout de suite), cls (classes en plus),
    qty (nombre d'exemplaires possédés : à partir de deux, la carte est posée sur une pile et le nombre s'affiche en bas à droite),
    serial (numéro de l'exemplaire, pour une carte en édition limitée).
    Cartes hors série : edition donne son habillage (« ceo » : Kameto, MY CEO), limited le nombre d'exemplaires, label ce qui s'écrit à la place du poste. */
export function cardHTML(card, cat, opts = {}) {
  const qty = opts.qty > 1 ? Math.floor(opts.qty) : 0;
  /* l'habillage d'une carte hors série (jamais sur une de ses versions) */
  const ed = !card.variant && card.edition ? card.edition : '';
  /* l'holographique, l'édition KC, la légendaire et les cartes hors série ont déjà leur propre lumière */
  const pr = card.variant === 'holo' || card.variant === 'kc' || card.variant === 'legend' || ed ? 0 : prestigeOf(card);
  const legend = card.variant === 'legend' && cat.legends ? cat.legends[card.base] : null;
  const team = cat.teamById.get(card.team);
  const photo = photoUrl(card), v = card.variant || '';
  /* un nom long est écrit plus petit pour tenir sur la carte */
  const len = Math.max(7, Array.from(card.name).length);
  const load = 'loading="' + (opts.eager ? 'eager' : 'lazy') + '" decoding="async" draggable="false"';
  const picture = photo ? '<img class="card-photo" src="' + photo + '" alt="" ' + load + '>' : SILHOUETTE;
  const flag = card.country
    ? '<img class="card-flag" src="' + flagUrl(card.country) + '" alt="' + esc(cat.countries[card.country]) + '" title="' + esc(cat.countries[card.country]) + '" loading="lazy" draggable="false">'
    : '';
  return '<article class="card t' + card.tier + (card.kind === 'c' ? ' is-coach' : '') + (v ? ' v-' + v : '') + (ed ? ' e-' + ed : '') + (pr ? ' is-prestige' + (pr > 1 ? ' is-icon' : '') : '')
    + (qty ? ' stack' + (qty > 2 ? ' s3' : '') : '') + (opts.cls ? ' ' + opts.cls : '') + '" data-id="' + esc(card.id) + '">'
    + '<div class="card-in"><div class="card-face card-front">'
    + '<div class="card-bg"></div>'
    + (pr > 1 ? '<div class="card-rays"></div>' : '')
    /* derrière le joueur, l'illustration de son champion fétiche (les full art n'en ont pas : le portrait remplit la carte) */
    + (card.art && !ed && (!v || v === 'holo') ? '<img class="card-art" src="' + DDRAGON + '/img/champion/loading/' + esc(card.art) + '.jpg" alt="" ' + load + '>' : '')
    /* édition KC : le « mur bleu » ; holographique et édition KC : une feuille de métal irisée derrière le joueur, et ses paillettes */
    + (v === 'kc' ? '<div class="card-wall"></div>' : '')
    + (v === 'holo' || v === 'kc' ? '<div class="card-foil"></div><div class="card-spark"></div>' : '')
    /* édition légendaire : les facettes d'un diamant, et ses éclats */
    + (v === 'legend' ? '<div class="card-facets"></div><div class="card-spark"></div>' : '')
    /* MY CEO : « CEO » en très grand derrière lui, et une pluie d'étoiles d'or */
    + (ed === 'ceo' ? '<div class="card-ceo">CEO</div><div class="card-spark"></div>' : '')
    + '<span class="card-wm">' + esc(v === 'kc' ? 'KC' : team ? team.short : '') + '</span>'
    + picture
    + '<div class="card-shade"></div>'
    + '<div class="card-side"><span class="card-ovr">' + card.ovr + '</span><span class="card-role">' + esc(card.label || ROLE_LABEL[card.role]) + '</span><i></i>'
    + flag + '<span class="card-league">' + esc(card.league) + '</span></div>'
    + '<div class="card-plate">'
    /* un trophée par titre mondial, avec son année */
    + (legend ? '<div class="card-cups" title="Champion du monde ' + legend.worlds.join(', ') + '">' + legend.worlds.map((y) => '<span><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-cup"/></svg><b>' + y + '</b></span>').join('') + '</div>' : '')
    + (ed === 'ceo' ? '<div class="card-myceo">My CEO</div>' : '')
    + '<div class="card-name" style="--n:' + len + '">' + esc(card.name) + '</div>'
    /* sur une carte KC, le joueur est sous le maillot de la Karmine : c'est elle qui est écrite sous son nom */
    + '<div class="card-team">' + esc(v === 'kc' && cat.karmine && cat.karmine[card.base] ? (cat.karmine[card.base][2] === 'KCB' ? 'Karmine Corp Blue' : 'Karmine Corp') : team ? team.name : card.team) + '</div>'
    + '<ul class="card-stats">' + statsOf(card).map((s) => '<li><b>' + card.stats[s[0]] + '</b><span>' + s[1] + '</span></li>').join('') + '</ul></div>'
    + '<div class="card-holo"></div><div class="card-frame"></div>'
    + (pr ? '<div class="card-edge"></div>' : '')
    + (v ? '<span class="card-mark">' + VARIANTS[v].mark + '</span>' : '')
    + (v === 'kc' ? '<div class="card-glint"></div><span class="card-era">' + esc(karmineEra(cat, card)) + '</span>' : '')
    + (v === 'legend' || ed === 'ceo' ? '<div class="card-glint"></div>' : '')
    /* édition limitée : son poinçon, et la plaque de son numéro à la pointe du blason */
    + (card.limited && !v ? '<span class="card-mark">Édition limitée</span><span class="card-serial">' + (opts.serial ? 'N° ' + String(opts.serial).padStart(3, '0') + ' / ' + card.limited : card.limited + ' exemplaires') + '</span>' : '')
    + '</div>' + (opts.back ? BACK : '') + '</div><i class="card-gem"></i>' + (qty ? '<span class="card-qty">×' + qty + '</span>' : '') + '</article>';
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
  /* une illustration qui ne charge pas : la carte garde son décor nu */
  else if (img && img.classList && img.classList.contains('card-art')) img.remove();
}, true);
