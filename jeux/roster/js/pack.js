/* Le sachet de cartes (« booster ») : un sachet de papier métallisé, soudé et gaufré en haut et en bas, avec une encoche de chaque côté
   pour le déchirer et un trou d'accroche dans la soudure du haut. Comme un vrai paquet, il porte une illustration (le champion vedette de la
   saison), la marque, le nombre de cartes, de petites mentions et un code-barres. Le même dessin sert sur l'accueil et pendant l'ouverture.
   Tout est décrit en pourcentages de la taille du sachet : sa silhouette, la ligne de déchirure, la bouche qui s'ouvre. */
import { DDRAGON, GAME_NAME } from './config.js';
import { esc } from './cards.js';

/* ---------- géométrie (en % de la largeur et de la hauteur du sachet) ---------- */
const TEETH = 21;          // dents du gaufrage, en haut et en bas
const DEPTH = 1.45;        // profondeur d'une dent
export const TEAR_Y = 9.6; // hauteur de la ligne de déchirure, juste sous la soudure du haut
const NOTCH = 1.7;         // profondeur des deux encoches
/* la déchirure n'est jamais droite : petits écarts au-dessus et au-dessous de la ligne (suite symétrique, pour pouvoir déchirer des deux côtés) */
const HALF = [0.2, -0.45, 0.3, -0.15, 0.5, -0.35, 0.1, 0.45, -0.3, 0.25, -0.5, 0.15, 0.4];
const JAG = HALF.concat([-0.2], HALF.slice().reverse());

const pt = (x, y) => x.toFixed(2) + '% ' + y.toFixed(2) + '%';
/* bord gaufré : de gauche à droite, à la hauteur « edge », dents tournées vers l'extérieur */
function zigzag(edge, out) {
  const list = [];
  for (let i = 0; i <= TEETH * 2; i++) list.push([(i * 100) / (TEETH * 2), i % 2 ? edge + out * DEPTH : edge]);
  return list;
}
/* la ligne de déchirure, de l'encoche de gauche à celle de droite ; « bend » creuse le milieu (la bouche du sachet qui s'ouvre) */
function tearLine(shift = 0, bend = 0) {
  const list = [[NOTCH, TEAR_Y + shift]];
  JAG.forEach((dy, i) => {
    const x = NOTCH + ((i + 1) * (100 - 2 * NOTCH)) / (JAG.length + 1);
    list.push([x, TEAR_Y + shift + dy + bend * Math.sin((Math.PI * x) / 100)]);
  });
  list.push([100 - NOTCH, TEAR_Y + shift]);
  return list;
}
const poly = (list) => 'polygon(' + list.map((p) => pt(p[0], p[1])).join(',') + ')';
const TOP = zigzag(DEPTH, -1), BOTTOM = zigzag(100 - DEPTH, 1).reverse();

/** Silhouette du sachet entier. */
export const SHAPE_FULL = poly([...TOP, [100, TEAR_Y - 0.9], [100 - NOTCH, TEAR_Y], [100, TEAR_Y + 0.9], ...BOTTOM, [0, TEAR_Y + 0.9], [NOTCH, TEAR_Y], [0, TEAR_Y - 0.9]]);
/** La bande du haut, que l'on arrache. */
export const SHAPE_STRIP = poly([...TOP, [100, TEAR_Y - 0.9], ...tearLine().reverse(), [0, TEAR_Y - 0.9]]);
/** Le corps du sachet, sous la déchirure. bend : creux de la bouche (0 : fermée). Il passe un rien sous la bande, pour ne laisser aucun jour. */
export const shapeBody = (bend = 0, shift = -0.3) => poly([...tearLine(shift, bend), [100, TEAR_Y + 0.9], ...BOTTOM, [0, TEAR_Y + 0.9]]);
/** Le fond du sachet (sa face arrière, vue par la bouche) : son bord monte un peu quand la bouche s'ouvre. */
export const shapeBack = (bend = 0) => poly([...tearLine(0, -bend), [100, TEAR_Y + 0.9], ...BOTTOM, [0, TEAR_Y + 0.9]]);
/** Les points de la déchirure, pour dessiner le papier blanc mis à nu (repère 100 × 100). */
export const tearPoints = (bend = 0) => tearLine(0, bend).map((p) => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ');

/* ---------- dessin ---------- */
/* l'imprimé : un cadre à pans coupés, des rayons, l'emblème en dorure.
   La dorure (dégradé « pkGold », défini dans index.html) est désignée ici, dans le dessin, et non dans la feuille de style :
   certains navigateurs chercheraient sinon le dégradé dans le fichier de style, où il n'existe pas. */
const GOLD_LINE = ' fill="none" stroke="url(#pkGold)"', GOLD_FILL = ' fill="url(#pkGold)" stroke="none"';
function artSVG() {
  const rays = [];
  for (let i = 0; i < 36; i++) {
    const a = (i * Math.PI) / 18, r = 300;
    const b = a + (i % 2 ? 0.035 : 0.075);
    rays.push('M125 168L' + (125 + r * Math.cos(a)).toFixed(1) + ' ' + (168 + r * Math.sin(a)).toFixed(1) + 'L' + (125 + r * Math.cos(b)).toFixed(1) + ' ' + (168 + r * Math.sin(b)).toFixed(1) + 'Z');
  }
  return '<svg class="pk-art" viewBox="0 0 250 380" preserveAspectRatio="none" aria-hidden="true">'
    + '<path class="pk-rays" stroke="none" d="' + rays.join('') + '"/>'
    + '<path class="pk-fr"' + GOLD_LINE + ' d="M26 50H224L236 62V318L224 330H26L14 318V62Z"/>'
    + '<path class="pk-fr thin"' + GOLD_LINE + ' d="M29 56H221L230 65V315L221 324H29L20 315V65Z"/>'
    /* le sceau : l'emblème du jeu, à cheval sur le bas de l'illustration */
    + '<path class="pk-seal" stroke="none" d="M125 200 151 226 125 252 99 226Z"/>'
    + '<path class="pk-orn"' + GOLD_LINE + ' d="M125 200 151 226 125 252 99 226Z"/>'
    + '<path class="pk-orn thin"' + GOLD_LINE + ' d="M125 207 144 226 125 245 106 226Z"/>'
    + '<path class="pk-core"' + GOLD_FILL + ' d="M125 215 136 226 125 237 114 226Z"/>'
    + '<path class="pk-orn thin"' + GOLD_LINE + ' d="M30 226h60M160 226h60"/>'
    + '<path class="pk-dot"' + GOLD_FILL + ' d="M125 46 129 50 125 54 121 50ZM26 226 30 222 34 226 30 230ZM216 226 220 222 224 226 220 230Z"/>'
    + '<path class="pk-orn thin"' + GOLD_LINE + ' d="M52 300h46M152 300h46"/><path class="pk-dot"' + GOLD_FILL + ' d="M125 296 129 300 125 304 121 300Z"/>'
    + '</svg>';
}
/* le code-barres du bas : des traits de largeurs variées, toujours les mêmes (c'est un dessin, il ne dit rien) */
const BARS = [2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 2, 1, 3, 1, 2, 2, 1, 1, 3, 1, 2, 1].map((w, k) => '<i style="flex:' + w + '"' + (k % 2 ? ' class="gap"' : '') + '></i>').join('');
/* une face du sachet : papier, illustration, imprimé, soudures gaufrées, grain, reflets. « lite » : sans l'imprimé (la bande du haut n'en porte pas).
   look.art : l'illustration du champion vedette (« Ahri_0 »), s'il y en a une. */
function face(cls, shape, season, size, lite, look) {
  const art = !lite && look && look.art ? '<img class="pk-hero" src="' + DDRAGON + '/img/champion/loading/' + esc(look.art) + '.jpg" alt="" draggable="false" decoding="async"><i class="pk-veil"></i>' : '';
  return '<div class="pk-face ' + cls + '" style="clip-path:' + shape + ';-webkit-clip-path:' + shape + '">'
    + (lite ? '' : art + artSVG()
      /* (look.title : ce qui s'écrit en tête à la place de la saison — « Booster du jour ») */
      + '<div class="pk-txt"><span class="pk-season">' + (look && look.title ? esc(look.title) : 'Saison ' + esc(season)) + '</span><span class="pk-name">' + esc(GAME_NAME) + '</span>'
      + '<span class="pk-sub">Joueurs &amp; coachs pros</span><span class="pk-count">' + esc(size) + ' cartes</span>'
      + '<span class="pk-legal">Projet de fan · non officiel · ne peut être vendu</span></div><span class="pk-bars" aria-hidden="true">' + BARS + '</span>')
    + '<i class="pk-crimp top"></i><i class="pk-crimp bot"></i><i class="pk-grain"></i><i class="pk-shade"></i><i class="pk-glare"></i></div>';
}
/* la sorte de booster donne ses couleurs au sachet : « free » (bleu, le pack gratuit), « credits » (rouge, le booster à crédits),
   « daily » (violet, le booster du jour gagné au « Champion du jour ») */
const kindOf = (look) => ' k-' + ((look && look.kind) || 'free');
/* le papier blanc mis à nu le long de la déchirure */
const fiber = (cls) => '<svg class="pk-fiber ' + cls + '" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + tearPoints() + '"/></svg>';

/** Le sachet tel qu'on le voit sur l'accueil. cls : « ready » (prêt à ouvrir) ou « waiting » (en attente).
    look : { kind: la sorte de booster, art: l'illustration du champion vedette }. */
export function packHTML(cls, season, size, look) {
  return '<div class="pack ' + (cls || '') + kindOf(look) + '"><i class="pk-ground"></i><div class="pk-rig">' + face('pk-full', SHAPE_FULL, season, size, false, look) + '</div></div>';
}
/** Le sachet de l'ouverture, en deux morceaux : le corps, et la bande du haut que l'on arrache (une partie encore attachée, une partie déjà déchirée). */
export function packSplitHTML(season, size, look) {
  const strip = face('pk-strip', SHAPE_STRIP, season, size, true, look);
  return '<div class="pack open-front' + kindOf(look) + '"><i class="pk-ground"></i><div class="pk-rig">'
    + face('pk-body', shapeBody(), season, size, false, look)
    /* tout ce qui suit la déchirure tient dans une boîte que l'on retourne pour déchirer de droite à gauche */
    + '<div class="pk-tearbox"><div class="pk-win fib"><div class="pk-win-in">' + fiber('body') + '</div></div>'
    + '<div class="pk-win hold"><div class="pk-win-in">' + strip + '</div></div>'
    + '<div class="pk-torn"><div class="pk-win gone"><div class="pk-win-in">' + strip + fiber('strip') + '</div></div></div></div>'
    + '<i class="pk-hint"></i></div></div>';
}
/** Le fond du sachet : l'intérieur argenté, visible par la bouche une fois le haut arraché. */
export function packBackHTML(look) {
  const shape = shapeBack();
  /* dans la bouche du sachet : la lueur qui s'en échappe quand il contient une très belle carte */
  return '<div class="pack open-back' + kindOf(look) + '"><div class="pk-rig"><div class="pk-inner" style="clip-path:' + shape + ';-webkit-clip-path:' + shape + '"></div><i class="pk-aura"></i></div></div>';
}
