/* Le sachet de cartes (« booster ») : un sachet de papier métallisé, soudé et gaufré en haut et en bas, avec une encoche de chaque côté
   pour le déchirer. Le même dessin sert sur l'accueil et pendant l'ouverture.
   Tout est décrit en pourcentages de la taille du sachet : sa silhouette, la ligne de déchirure, la bouche qui s'ouvre. */
import { GAME_NAME } from './config.js';
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
    + '<path class="pk-orn"' + GOLD_LINE + ' d="M125 96 197 168 125 240 53 168Z"/>'
    + '<path class="pk-orn thin"' + GOLD_LINE + ' d="M125 112 181 168 125 224 69 168Z"/>'
    + '<path class="pk-core"' + GOLD_FILL + ' d="M125 136 157 168 125 200 93 168Z"/>'
    + '<path class="pk-orn thin"' + GOLD_LINE + ' d="M36 168h20M194 168h20M125 70v14M125 252v10"/>'
    + '<path class="pk-dot"' + GOLD_FILL + ' d="M125 60 129 64 125 68 121 64ZM30 168 34 172 30 176 26 172ZM220 168 224 172 220 176 216 172Z"/>'
    + '<path class="pk-orn thin"' + GOLD_LINE + ' d="M52 300h46M152 300h46"/><path class="pk-dot"' + GOLD_FILL + ' d="M125 296 129 300 125 304 121 300Z"/>'
    + '</svg>';
}
/* une face du sachet : papier, imprimé, soudures gaufrées, grain, reflets. « lite » : sans l'imprimé (la bande du haut n'en porte pas). */
function face(cls, shape, season, size, lite) {
  return '<div class="pk-face ' + cls + '" style="clip-path:' + shape + ';-webkit-clip-path:' + shape + '">'
    + (lite ? '' : artSVG()
      + '<div class="pk-txt"><span class="pk-season">Saison ' + esc(season) + '</span><span class="pk-name">' + esc(GAME_NAME) + '</span>'
      + '<span class="pk-sub">Joueurs &amp; coachs pros</span><span class="pk-count">' + esc(size) + ' cartes</span></div>')
    + '<i class="pk-crimp top"></i><i class="pk-crimp bot"></i><i class="pk-grain"></i><i class="pk-shade"></i><i class="pk-glare"></i></div>';
}
/* le papier blanc mis à nu le long de la déchirure */
const fiber = (cls) => '<svg class="pk-fiber ' + cls + '" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + tearPoints() + '"/></svg>';

/** Le sachet tel qu'on le voit sur l'accueil. cls : « ready » (prêt à ouvrir) ou « waiting » (en attente). */
export function packHTML(cls, season, size) {
  return '<div class="pack ' + (cls || '') + '"><i class="pk-ground"></i><div class="pk-rig">' + face('pk-full', SHAPE_FULL, season, size, false) + '</div></div>';
}
/** Le sachet de l'ouverture, en deux morceaux : le corps, et la bande du haut que l'on arrache (une partie encore attachée, une partie déjà déchirée). */
export function packSplitHTML(season, size) {
  const strip = face('pk-strip', SHAPE_STRIP, season, size, true);
  return '<div class="pack open-front"><i class="pk-ground"></i><div class="pk-rig">'
    + face('pk-body', shapeBody(), season, size, false)
    /* tout ce qui suit la déchirure tient dans une boîte que l'on retourne pour déchirer de droite à gauche */
    + '<div class="pk-tearbox"><div class="pk-win fib"><div class="pk-win-in">' + fiber('body') + '</div></div>'
    + '<div class="pk-win hold"><div class="pk-win-in">' + strip + '</div></div>'
    + '<div class="pk-torn"><div class="pk-win gone"><div class="pk-win-in">' + strip + fiber('strip') + '</div></div></div></div>'
    + '<i class="pk-hint"></i></div></div>';
}
/** Le fond du sachet : l'intérieur argenté, visible par la bouche une fois le haut arraché. */
export function packBackHTML() {
  const shape = shapeBack();
  return '<div class="pack open-back"><div class="pk-rig"><div class="pk-inner" style="clip-path:' + shape + ';-webkit-clip-path:' + shape + '"></div></div></div>';
}
