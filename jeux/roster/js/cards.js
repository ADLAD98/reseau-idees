/* Fabrication d'une carte à l'écran. La même carte sert partout : collection, ouverture de pack, fiche détaillée, équipe. */
import { COACH_STATS, DDRAGON, GAME_NAME, LEGEND_PHOTOS, PHOTOS, PLAYER_STATS, PRESTIGE_TEAMS, ROLE_LABEL } from './config.js';
import { LOGOS } from './logos.js';

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
      /* la carte légendaire a sa propre photo (celle que donne le serveur ; à défaut, celle que le jeu connaît) */
      if (legend) { const own = legend.photo || LEGEND_PHOTOS[c.id]; if (own) card.photo = own; }
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
/** Le logo d'une équipe (hébergé par Leaguepedia, comme les photos), à la largeur demandée ; null si le jeu n'en connaît pas. */
export const logoUrl = (teamId, width) => (LOGOS[teamId] ? PHOTOS + LOGOS[teamId] + '/revision/latest/scale-to-width-down/' + (width || 120) : null);
/** Le logo d'une équipe, prêt à poser dans la page (rien si le jeu n'en connaît pas). cls : sa classe. */
export const logoHTML = (teamId, cls, width) => { const url = logoUrl(teamId, width); return url ? '<img class="' + cls + '" src="' + url + '" alt="" loading="lazy" decoding="async" draggable="false">' : ''; };
export const statsOf = (card) => (card.kind === 'c' ? COACH_STATS : PLAYER_STATS);

/* Le dos, le même pour toutes les cartes : un cristal taillé, serti dans un double anneau d'or et ses soixante graduations ; derrière lui
   une étoile à huit branches et un halo ; autour, deux rameaux de laurier ; aux angles, des écoinçons ; dessous, le nom du jeu.
   Le tout en dorure sur un émail bleu nuit guilloché (les dégradés « cardGold », « backGem » et « backHalo » sont dans index.html). */
const BACK = (() => {
  const GOLD = ' fill="none" stroke="url(#cardGold)"', FILL = ' fill="url(#cardGold)" stroke="none"';
  /* les deux rameaux : onze feuilles de chaque côté, qui montent du bas du médaillon en s'amenuisant */
  let leaves = '';
  for (let k = 0; k < 11; k++) {
    const deg = 106 + k * 10.4, a = (deg * Math.PI) / 180, x = 50 + 31.6 * Math.cos(a), y = 62 + 31.6 * Math.sin(a), size = 3.3 - k * 0.13, rot = deg + (k % 2 ? 40 : -34);
    for (const m of [1, -1]) {
      const px = m > 0 ? x : 100 - x;
      leaves += '<ellipse cx="' + px.toFixed(2) + '" cy="' + y.toFixed(2) + '" rx="' + (size * 0.33).toFixed(2) + '" ry="' + size.toFixed(2) + '" transform="rotate(' + (m * rot).toFixed(1) + ' ' + px.toFixed(2) + ' ' + y.toFixed(2) + ')"/>';
    }
  }
  /* l'étoile : huit longues branches fines, seize sommets */
  let star = '';
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8 - Math.PI / 2, r = k % 4 === 0 ? 40 : k % 2 === 0 ? 31 : 9.5;
    star += (k ? 'L' : 'M') + (50 + r * Math.cos(a)).toFixed(2) + ' ' + (62 + r * Math.sin(a)).toFixed(2);
  }
  return '<div class="card-face card-back"><svg class="back-art" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">'
    + '<circle cx="50" cy="62" r="40" fill="url(#backHalo)" stroke="none"/>'
    + '<g' + GOLD + '>'
    /* deux filets qui suivent la silhouette, et les écoinçons du haut */
    + '<path stroke-width=".42" d="M10.9 7H89.1L93 10.9V125.15L50 132.9 7 125.15V10.9Z"/><path stroke-width=".2" d="M12.3 9.3H87.7L90.7 12.3V123.4L50 130.7 9.3 123.4V12.3Z"/>'
    + '<path stroke-width=".3" d="M14.6 22V15.4L18.4 11.6H25M14.6 17.800 20.800 11.600M85.400 22V15.4L81.600 11.6H75M85.400 17.800 79.200 11.600"/>'
    + '<path stroke-width=".3" d="M14.6 104V113.500L20 118.400M85.400 104V113.500L80 118.400"/>'
    + '<path class="back-star" stroke-width=".2" d="' + star + 'Z"/>'
    /* le double anneau et ses graduations */
    + '<circle cx="50" cy="62" r="24.6" stroke-width=".6"/><circle cx="50" cy="62" r="22.1" stroke-width=".22"/><circle cx="50" cy="62" r="27.3" stroke-width="1.3" stroke-dasharray=".3 2.559"/>'
    + '<path stroke-width=".28" d="M50 9.3V19.500M9.3 62H16M84 62H90.7M30 100H47M53 100H70"/></g>'
    + '<g class="back-laurel"' + FILL + '>' + leaves + '</g>'
    /* le cristal : quatre facettes autour d'une table claire, un liseré d'or, un éclat */
    + '<g class="back-gem"><path fill="#8fe6ff" d="M50 43 61.500 62 55.400 62 50 54.200Z"/><path fill="#49bfee" d="M50 43 38.500 62 44.600 62 50 54.200Z"/>'
    + '<path fill="#0f5f95" d="M50 81 61.500 62 55.400 62 50 69.800Z"/><path fill="#0a4370" d="M50 81 38.500 62 44.600 62 50 69.800Z"/>'
    + '<path fill="url(#backGem)" d="M50 54.200 55.400 62 50 69.800 44.600 62Z"/>'
    + '<path fill="none" stroke="#f4feff" stroke-width=".3" stroke-linecap="round" opacity=".85" d="M50.700 44.600 60 60.300"/>'
    + '<path fill="#fff" d="M53.600 50.200 54.200 52.200 56.200 52.800 54.200 53.400 53.600 55.400 53 53.400 51 52.800 53 52.200Z"/>'
    + '<path' + GOLD + ' stroke-width=".55" stroke-linejoin="round" d="M50 43 61.500 62 50 81 38.500 62Z"/></g>'
    /* les griffes de la monture, et les losanges des axes */
    + '<g' + FILL + '><path d="M50 39.400 52.400 43 50 46 47.600 43ZM50 84.600 52.400 81 50 78 47.600 81ZM64.800 62 61.500 59.800 58.800 62 61.500 64.200ZM35.200 62 38.500 59.800 41.200 62 38.500 64.200Z"/>'
    + '<path d="M50 19 52.600 21.600 50 24.200 47.400 21.600ZM50 98.300 51.700 100 50 101.700 48.300 100ZM50 122.300 51.900 124.200 50 126.100 48.100 124.200ZM16 62 17.600 60.400 19.200 62 17.600 63.600ZM80.800 62 82.400 60.400 84 62 82.400 63.600Z"/></g></svg>'
    + '<span class="back-word">' + GAME_NAME + '</span><span class="back-sub">Cartes e-sport</span><div class="card-frame"></div></div>';
})();
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
  /* le logo de son club, sous le drapeau, comme sur une carte de foot ; sur une édition KC, celui de la Karmine, qu'il y joue encore ou non */
  const clubId = v === 'kc' ? 'KC' : card.team, club = logoUrl(clubId, 120);
  const flag = card.country
    ? '<img class="card-flag" src="' + flagUrl(card.country) + '" alt="' + esc(cat.countries[card.country]) + '" title="' + esc(cat.countries[card.country]) + '" loading="lazy" draggable="false">'
    : '';
  return '<article class="card t' + card.tier + (card.kind === 'c' ? ' is-coach' : '') + (v ? ' v-' + v : '') + (ed ? ' e-' + ed : '') + (pr ? ' is-prestige' + (pr > 1 ? ' is-icon' : '') : '')
    + (qty ? ' stack' + (qty > 2 ? ' s3' : '') : '') + (opts.cls ? ' ' + opts.cls : '') + '" data-id="' + esc(card.id) + '">'
    + '<div class="card-in"><div class="card-face card-front">'
    + '<div class="card-bg"></div>'
    + (pr > 1 ? '<div class="card-rays"></div>' : '')
    /* derrière le joueur, l'illustration de son champion fétiche (les full art n'en ont pas : le portrait remplit la carte) */
    + (card.art && !ed && (!v || v === 'holo' || v === 'legend') ? '<img class="card-art" src="' + DDRAGON + '/img/champion/loading/' + esc(card.art) + '.jpg" alt="" ' + load + '>' : '')
    /* édition KC : le « mur bleu » ; holographique et édition KC : une feuille de métal irisée derrière le joueur, et ses paillettes */
    + (v === 'kc' ? '<div class="card-wall"></div>' + (logoUrl('KC') ? '<img class="card-crest" src="' + logoUrl('KC', 300) + '" alt="" ' + load + '>' : '') : '')
    + (v === 'holo' || v === 'kc' ? '<div class="card-foil"></div><div class="card-spark"></div>' : '')
    /* édition légendaire : derrière le joueur, l'aurore, la couronne de rayons et les facettes d'un diamant */
    + (v === 'legend' ? '<div class="card-aurora"></div><div class="card-crown"></div><div class="card-facets"></div>' : '')
    /* MY CEO : « CEO » en très grand derrière lui, et une pluie d'étoiles d'or */
    + (ed === 'ceo' ? '<div class="card-ceo">CEO</div><div class="card-spark"></div>' : '')
    + '<span class="card-wm">' + esc(v === 'kc' ? 'KC' : team ? team.short : '') + '</span>'
    /* édition légendaire : la feuille irisée, derrière lui (ses couleurs ne passent jamais sur son visage) */
    + (v === 'legend' ? '<div class="card-prism"></div>' : '')
    + picture
    /* édition légendaire : devant lui, quelques éclats */
    + (v === 'legend' ? '<div class="card-spark"></div>' : '')
    + '<div class="card-shade"></div>'
    + '<div class="card-side"><span class="card-ovr">' + card.ovr + '</span><span class="card-role">' + esc(card.label || ROLE_LABEL[card.role]) + '</span><i></i>'
    + flag + (club ? '<img class="card-club" src="' + club + '" alt="" ' + load + '>' : '') + '<span class="card-league">' + esc(card.league) + '</span></div>'
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
  /* un logo qui ne charge pas disparaît, tout simplement */
  else if (img && img.classList && (img.classList.contains('card-club') || img.classList.contains('card-crest') || img.classList.contains('logo'))) img.remove();
  /* une illustration qui ne charge pas : la carte garde son décor nu */
  else if (img && img.classList && img.classList.contains('card-art')) img.remove();
}, true);
