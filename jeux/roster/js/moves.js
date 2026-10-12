/* Les déplacements des dix joueurs pendant une partie.
   Le serveur a joué la partie et envoie la suite des événements (duels, ganks, dragons, combats, tours…).
   Ce module en tire le trajet complet de chaque joueur, du début à la fin : les joueurs de voie tiennent leur ligne, rentrent à la base
   après un duel perdu et reviennent à pied ; les junglers enchaînent leurs camps, traversent par la rivière, se cachent avant un gank
   et se placent en avance sur les objectifs ; après la phase de lane, l'équipe se répartit puis se regroupe.
   Une tour attaquée est défendue : ceux qui tiennent la voie se replient sous elle (toute l'équipe pour une tour de base), et les derniers
   défenseurs sont dans leur base quand elle tombe. En fin de partie on ne reste pas à cinq au milieu : le toplaner pousse une voie de côté
   (et rejoint les siens à la Téléportation), le midlaner l'autre s'il joue un champion de duel ; on se regroupe pour les objectifs.
   Chaque joueur a aussi son niveau, son ultime (disponible ou non), sa vie et sa ressource : ce que le serveur ne compte pas, la mise
   en scène le déduit de ce qu'il fait, avec les vrais délais du jeu (temps de mort, camps, récupération des ultimes).
   Quand le serveur suit les ultimes (il dit alors, à chaque action, qui lance le sien), la mise en scène s'y tient : un ultime ne part
   que là où le serveur l'a décidé ; ceux qui traversent la carte amènent leur lanceur sur place, ou s'abattent de loin.
   Tout passe par les couloirs de la carte (voies, sentiers de la jungle, rivière), jamais à travers les murs.
   L'or de chacun, ses sbires, sa quête de rôle et ses achats sont comptés par gold.js : quand un joueur a de quoi faire un bel achat, il
   rentre à la base — ses objets n'apparaissent que là, à la boutique.
   Rien ici ne touche à la page : match.js lit ces trajets image par image. */
import { planGold } from './gold.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const mirror = (p) => [1000 - p[0], 1000 - p[1]];
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---------- la carte : un carré de 1000 de côté, base bleue en bas à gauche, base rouge en haut à droite ---------- */
/* bâtiments bleus de chaque voie (haut, milieu, bas) : tour extérieure, intérieure, d'inhibiteur, puis l'inhibiteur */
export const BLUE = [
  [[92, 300], [92, 530], [92, 690], [92, 768]],
  [[415, 585], [335, 665], [262, 738], [218, 782]],
  [[700, 908], [470, 908], [310, 908], [232, 908]],
];
/* la carte est symétrique : la voie du haut des rouges est le reflet de la voie du bas des bleus */
export const STRUCT = [BLUE, [BLUE[2].map(mirror), BLUE[1].map(mirror), BLUE[0].map(mirror)]];
export const NEXUS_TOWERS = [[[126, 840], [160, 874]], [[874, 160], [840, 126]]];
export const NEXUS = [[96, 904], [904, 96]];
export const FOUNTAIN = [[50, 950], [950, 50]];
export const PIT = { drake: [650, 708], baron: [350, 292] };

/* le tracé des trois voies, de la base bleue à la base rouge */
const TOP_LINE = [[92, 800], [92, 690], [92, 530], [92, 300], [92, 170], [99, 127], [127, 99], [170, 92], [300, 92], [530, 92], [690, 92], [800, 92]];
const MID_LINE = [[200, 800], [262, 738], [335, 665], [415, 585], [500, 500], [585, 415], [665, 335], [738, 262], [800, 200]];
function makeLane(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + dist(points[i - 1], points[i]));
  return { points, cum, total: cum[cum.length - 1], mid: cum[cum.length - 1] / 2 };
}
export const LANES = [makeLane(TOP_LINE), makeLane(MID_LINE), makeLane(TOP_LINE.map(mirror).reverse())];
const LANE_INDEX = { top: 0, mid: 1, bot: 2 };
/* de quel côté d'une voie se trouve l'intérieur de la carte (pour la voie du milieu : +1 vers le dragon, −1 vers le Baron) */
const INSIDE = [1, 1, -1];
function onLane(lane, d) {
  const L = LANES[lane], s = clamp(L.mid + d, 0, L.total);
  let i = 1;
  while (i < L.points.length - 1 && L.cum[i] < s) i++;
  const a = L.points[i - 1], b = L.points[i], k = (s - L.cum[i - 1]) / (L.cum[i] - L.cum[i - 1] || 1);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}
/** Direction de la voie à cet endroit, vers la base rouge (lissée : dans un virage, elle tourne peu à peu). */
function laneDir(lane, d) {
  const a = onLane(lane, d - 75), b = onLane(lane, d + 75), len = dist(a, b) || 1;
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
}
/** Le point d'une voie à la distance d de son milieu (positive vers la base rouge), décalé de « off » sur le côté. */
export function laneAt(lane, d, off = 0) {
  const p = onLane(lane, d);
  if (!off) return p;
  const u = laneDir(lane, d);
  return [p[0] - u[1] * off, p[1] + u[0] * off];
}
/** Distance d'un point au milieu de sa voie, le long de la voie. */
function laneDist(lane, p) {
  const L = LANES[lane];
  let best = Infinity, at = 0;
  for (let i = 1; i < L.points.length; i++) {
    const a = L.points[i - 1], b = L.points[i], len = L.cum[i] - L.cum[i - 1];
    const k = clamp(((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (len * len), 0, 1);
    const q = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], d = dist(p, q);
    if (d < best) { best = d; at = L.cum[i - 1] + len * k; }
  }
  return at - L.mid;
}
/* distance des bâtiments au milieu de leur voie : tour extérieure, intérieure, d'inhibiteur, inhibiteur (les deux camps sont à égale distance) */
const STRUCT_D = [0, 1, 2].map((lane) => BLUE[lane].map((p) => Math.abs(laneDist(lane, p))));

/* ---------- les couloirs : voies, sentiers de la jungle, rivière ---------- */
/* points de passage du côté bleu ; ceux du côté rouge sont leur reflet */
const HALF = {
  f: [50, 950], n: [160, 840],
  ti: [92, 740], t2: [92, 530], tq: [92, 415], t1: [92, 300], tp: [92, 205],
  mi: [232, 768], m2: [335, 665], m1: [415, 585], mp: [458, 542],
  bi: [260, 908], b2: [470, 908], bq: [585, 908], b1: [700, 908], bp: [800, 908],
  gr: [150, 440], bb: [262, 468], wo: [258, 566],       // gromp, buff bleu, loups
  ra: [462, 640], rb: [528, 735], kr: [574, 822],       // raptors, buff rouge, golems
  g1: [124, 372],     // de la voie du haut vers le gromp
  g2: [192, 688],     // porte de la base vers les loups
  g3: [350, 572],     // de la voie du milieu vers les loups
  g4: [302, 398],     // rampe du buff bleu vers la rivière
  g5: [372, 470],     // passage vers la rivière, près du milieu
  g6: [338, 806],     // porte de la base vers le buff rouge
  g7: [606, 880],     // de la voie du bas vers les golems
  g8: [598, 690],     // rampe du buff rouge vers le dragon
  g9: [528, 590],     // des raptors vers la rivière
  tb: [150, 262],     // buisson du haut, entre la rivière et la tour
  ub: [768, 846],     // buisson du bas
};
/* points communs : milieu des voies, rivière, fosses du Baron et du dragon */
const SHARED = {
  tc: [112, 112], mc: [500, 500], bc: [888, 888],
  r1: [188, 226], r2: [266, 288], r3: [333, 342], r4: [422, 425], r5: [578, 575], r6: [667, 658], r7: [734, 712], r8: [812, 774],
  ba: [350, 292], dr: [650, 708],
};
const SWAP = { tc: 'bc', bc: 'tc', mc: 'mc', r1: 'r8', r2: 'r7', r3: 'r6', r4: 'r5', r5: 'r4', r6: 'r3', r7: 'r2', r8: 'r1', ba: 'dr', dr: 'ba' };
const LANE_LINKS = 'f-n n-ti n-mi n-bi ti-t2 t2-tq tq-t1 t1-tp tp-tc mi-m2 m2-m1 m1-mp mp-mc bi-b2 b2-bq bq-b1 b1-bp bp-bc';
const JUNGLE_LINKS = 'n-g2 g2-wo wo-bb bb-gr gr-g1 g1-tq g1-t1 wo-g3 g3-m2 g3-m1 bb-g4 g4-r3 g4-r2 bb-g5 wo-g5 g5-r4 g5-mp'
  + ' n-g6 g6-rb g6-kr rb-kr rb-ra ra-m1 ra-m2 ra-g9 g9-r5 g9-mp rb-g8 g8-r6 kr-g7 g7-bq g7-b1 kr-ub ub-r8 ub-bp ub-b1 tb-r1 tb-t1 tb-tp';
const RIVER_LINKS = 'r1-tc r1-r2 r2-r3 r3-ba r3-r4 r4-mc mc-r5 r5-r6 r6-dr r6-r7 r7-r8 r8-bc';

export const NODE = {};
for (const [k, p] of Object.entries(SHARED)) NODE[k] = p;
for (const [k, p] of Object.entries(HALF)) { NODE[k + '0'] = p; NODE[k + '1'] = mirror(p); }
const nodeName = (k, side) => (k in SHARED ? (side ? SWAP[k] : k) : k + side);
const linksOf = (text) => {
  const out = [];
  for (const link of text.split(' ')) { const [a, b] = link.split('-'); for (const side of [0, 1]) out.push([nodeName(a, side), nodeName(b, side)]); }
  return out;
};
/** Les sentiers de la jungle, pour le dessin de la carte. */
export const TRAILS = linksOf(JUNGLE_LINKS).map(([a, b]) => [NODE[a], NODE[b]]);
const NAMES = Object.keys(NODE), POINTS = NAMES.map((k) => NODE[k]), COUNT = NAMES.length;
const INDEX = new Map(NAMES.map((k, i) => [k, i]));
const ALL_LINKS = [...linksOf(LANE_LINKS), ...linksOf(JUNGLE_LINKS), ...linksOf(RIVER_LINKS)];
const pathLen = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]); return s; };
/** De quoi trouver son chemin dans un jeu de couloirs : le plus court chemin entre tous les points de passage est calculé une fois.
    allow(nom, endroit) : ce point de passage peut-il servir d'entrée (ou de sortie) directe pour cet endroit ? (par défaut, tous)
    strict(a, b) : entre ces deux endroits, pas de ligne droite, même s'ils sont proches (par défaut, jamais)
    spare : le jeu de couloirs vers lequel se rabattre quand aucun de ceux-ci ne mène à destination */
function makeRouter(links, allow, strict, spare) {
  const D = POINTS.map(() => new Float64Array(COUNT).fill(Infinity)), NEXT = POINTS.map(() => new Int16Array(COUNT).fill(-1));
  for (let i = 0; i < COUNT; i++) { D[i][i] = 0; NEXT[i][i] = i; }
  for (const [a, b] of links) {
    const i = INDEX.get(a), j = INDEX.get(b), d = dist(POINTS[i], POINTS[j]);
    if (d < D[i][j]) { D[i][j] = D[j][i] = d; NEXT[i][j] = j; NEXT[j][i] = i; }
  }
  for (let k = 0; k < COUNT; k++) for (let i = 0; i < COUNT; i++) {
    const ik = D[i][k];
    if (ik === Infinity) continue;
    for (let j = 0; j < COUNT; j++) if (ik + D[k][j] < D[i][j]) { D[i][j] = ik + D[k][j]; NEXT[i][j] = NEXT[i][k]; }
  }
  /* les points de passage les plus proches d'un endroit (cinq au plus, à moins de 260) */
  function nearest(p) {
    const list = [];
    for (let i = 0; i < COUNT; i++) {
      if (allow && !allow(NAMES[i], p)) continue;
      const d = dist(p, POINTS[i]);
      if (list.length < 5 || d < list[list.length - 1][0]) {
        let k = list.length;
        while (k > 0 && list[k - 1][0] > d) k--;
        list.splice(k, 0, [d, i]);
        if (list.length > 5) list.pop();
      }
    }
    return list.filter((x, k) => k === 0 || x[0] < 260);
  }
  /** Le chemin d'un endroit à un autre, par les couloirs de la carte. */
  function route(a, b) {
    const direct = dist(a, b), around = !!strict && strict(a, b);
    if (direct < 110 && !around) return [a, b];
    let best = null;
    for (const [da, i] of nearest(a)) for (const [db, j] of nearest(b)) {
      const len = da + D[i][j] + db;
      if (!best || len < best.len) best = { i, j, len };
    }
    /* tout près (ou aucun couloir ne mène là) : inutile de faire un détour par un point de passage */
    if (spare && (!best || !Number.isFinite(best.len))) return spare.route(a, b);
    if (!best || !Number.isFinite(best.len) || (!around && direct < 230 && best.len > direct * 1.45)) return [a, b];
    const pts = [a];
    let k = best.i;
    pts.push(POINTS[k]);
    for (let guard = 0; k !== best.j && guard < COUNT; guard++) { k = NEXT[k][best.j]; pts.push(POINTS[k]); }
    pts.push(b);
    /* les points confondus sont retirés */
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) if (dist(out[out.length - 1], pts[i]) > 6 || i === pts.length - 1) out.push(pts[i]);
    if (out.length > 2 && dist(out[out.length - 2], out[out.length - 1]) <= 6) out.splice(out.length - 2, 1);
    return out;
  }
  return { route, routeLen: (a, b) => pathLen(route(a, b)) };
}
/* tous les couloirs, sans restriction : pour se déplacer de son côté de la carte et dans sa propre base */
const FREE = makeRouter(ALL_LINKS, null, null, null);
export const route = FREE.route, routeLen = FREE.routeLen;
/* Dans la base adverse, on n'entre que par une voie dont l'inhibiteur est tombé : ses portes côté jungle ne s'ouvrent qu'à ses défenseurs,
   et l'on ne passe pas devant un inhibiteur debout. Un jeu de couloirs par cas (base visée, voies ouvertes), calculé à la demande.
   (La carte est symétrique : la voie du haut arrive dans la base rouge par le reflet de la voie du bas des bleus.) */
export const INHIB_NODE = [['ti0', 'mi0', 'bi0'], ['bi1', 'mi1', 'ti1']];
export const HEART = 196;
const SIEGE = new Map();
function siegeRouter(def, open) {
  const key = def + ':' + open.map((o) => (o ? 1 : 0)).join('');
  if (SIEGE.has(key)) return SIEGE.get(key);
  const closed = new Set(INHIB_NODE[def].filter((k, l) => !open[l])), gates = new Set(['g2' + def, 'g6' + def]), heart = 'n' + def, fount = 'f' + def;
  const barred = (k) => gates.has(k) || closed.has(k);
  const links = ALL_LINKS.filter(([a, b]) => !((a === heart && barred(b)) || (b === heart && barred(a))));
  const nexus = NEXUS[def];
  /* un endroit du cœur de la base (à moins de HEART du Nexus : là où se joue l'assaut final) ne se rejoint que par une voie ouverte ;
     un endroit du dehors ne donne jamais droit dans le cœur */
  const doors = new Set(INHIB_NODE[def].filter((k, l) => open[l]).concat([heart, fount]));
  const inside = (p) => dist(p, nexus) < HEART;
  /* (et l'on ne coupe pas tout droit pour y entrer ou en sortir, même de tout près) */
  const router = makeRouter(links, (name, p) => (inside(p) ? doors.has(name) : name !== heart && name !== fount), (a, b) => inside(a) !== inside(b), FREE);
  SIEGE.set(key, router);
  return router;
}

/* ---------- les camps de la jungle ---------- */
/* hold : temps passé à tuer le camp (à l'écran) ; respawn : délai de réapparition ; spawn : première apparition (secondes de jeu).
   Les délais du jeu en 2026 : buffs, loups et raptors à 0:55, gromp et golems à 1:07 ; les buffs reviennent en 5:00, les camps en 2:15. */
const CAMP_KINDS = { bb: ['blue', 950, 300, 55], rb: ['red', 950, 300, 55], gr: ['camp', 780, 135, 67], wo: ['camp', 780, 135, 55], ra: ['camp', 780, 135, 55], kr: ['camp', 820, 135, 67] };
export const CAMPS = [];
for (const side of [0, 1]) for (const [k, [kind, hold, respawn, spawn]] of Object.entries(CAMP_KINDS)) {
  CAMPS.push({ id: k + side, p: NODE[k + side], side, kind, hold, respawn, spawn });
}
/* les deux crabes de la rivière, au premier jungler qui passe : là à 2:55, de retour 2:30 après leur mort */
CAMPS.push({ id: 'crabT', p: NODE.r2, side: -1, kind: 'crab', hold: 620, respawn: 150, spawn: 175 });
CAMPS.push({ id: 'crabB', p: NODE.r7, side: -1, kind: 'crab', hold: 620, respawn: 150, spawn: 175 });
/* les camps que chaque jungler peut tuer, et la longueur du chemin de l'un à l'autre (calculée une fois) */
const CAMPS_OF = [0, 1].map((side) => CAMPS.filter((c) => c.side === side || c.side < 0));
const CAMP_PATHS = CAMPS_OF.map((list) => list.map((a) => list.map((b) => (a === b ? 0 : routeLen(a.p, b.p)))));

/* ---------- le rythme de la mise en scène (millisecondes à vitesse ×1) ---------- */
const PACE = 64, TRAVEL_MIN = 1400, TRAVEL_MAX = 3500;   // durée du trajet entre deux événements, selon le temps de jeu qui les sépare
const OPENING = [4800, 6000];                            // le tout début : chacun gagne sa voie, les junglers lancent leur premier tour
export const SHOW_LEAD = 480, KILL_GAP = 250;            // avant la première élimination, puis entre deux
const V = 0.34, VFAST = 0.52, VRUSH = 0.8, VMAX = 1.5, VSLOW = 0.09;   // vitesses de marche, en unités de carte par milliseconde
const LANING_END = 840, LATE = 1500;
/* Les niveaux : heure (secondes de jeu) à laquelle chaque poste (TOP, JGL, MID, ADC, SUP) atteint d'ordinaire les niveaux 2, 6, 11, 16 et 18
   (une estimation, calée sur le départ des sbires à 0:30 depuis 2026) ; entre deux repères, un niveau à intervalles réguliers.
   Le niveau 6 donne l'ultime. Depuis 2026, la quête du toplaner lui permet de monter jusqu'au niveau 20. */
const LEVEL_MARKS = [2, 6, 11, 16, 18];
const LEVEL_AT = [[95, 305, 690, 1290, 1640], [100, 375, 780, 1420, 1800], [95, 300, 680, 1270, 1620], [115, 430, 880, 1560, 1980], [115, 520, 1090, 1860, 2400]];
const MAX_LEVEL = [20, 18, 18, 18, 18], AFTER_18 = 170;
/* Le temps de mort d'une vraie partie : une attente de base selon le niveau, allongée à partir de 15 minutes — +0,425 % par demi-minute
   jusqu'à 30:00, puis +0,3 % jusqu'à 45:00, puis +1,45 %, sans dépasser 50 % (les niveaux 19 et 20 prolongent la progression). */
const RESPAWN = [0, 10, 10, 12, 12, 14, 16, 20, 25, 28, 32.5, 35, 37.5, 40, 42.5, 45, 47.5, 50, 52.5, 55, 57.5];
export function deathTime(level, g) {
  const m = g / 60, halves = (from) => Math.ceil(2 * (m - from));
  const more = m < 15 ? 0 : m < 30 ? halves(15) * 0.425 : m < 45 ? 12.75 + halves(30) * 0.3 : Math.min(50, 21.75 + halves(45) * 1.45);
  return RESPAWN[clamp(Math.round(level), 1, 20)] * (1 + more / 100);
}
/* La Téléportation, pour ceux qui l'ont prise (toplaners et midlaners, le plus souvent) : au-delà de TP_MIN (distance par les couloirs), on ne
   vient plus à pied ; TP_COST : l'incantation, à l'écran. Son délai de récupération est celui du sort : cinq minutes de jeu. */
const TP_MIN = 520, TP_COST = 560;
/* Un ultime qui amène son lanceur de l'autre bout de la carte (Twisted Fate, Shen, Nocturne, Galio, Pantheon…) : l'élan, à l'écran. */
const FLY_COST = 420;

/** Prépare tous les déplacements d'une partie. sim : ce que le serveur renvoie (events, duration, kills).
    kits : pour chacun des dix joueurs, ce qu'on sait de son champion — { res: 'mana' | 'energy' | 'build' | 'none' (sa ressource),
    cd: [délais de son ultime par rang], early: l'ultime sert dès le niveau 1, split: champion de duel, qui tient une voie de côté,
    sums: ses deux sorts d'invocateur, [[lettre, délai de récupération], …] — F Saut éclair, T Téléportation, S Châtiment, I Embrasement,
    H Soins, B Barrière, E Fatigue, C Purge, G Fantôme ; et pour son or (gold.js) — cspm : ses sbires par minute cette saison, edge : son
    duel de draft, build : ce qu'il achète, sup : la forme finale de son objet de support }. Sans « kits », seul le toplaner se téléporte. */
export function planMoves(sim, kits = []) {
  const ev = sim.events, N = ev.length;
  const seed = (Math.round(sim.duration) * 7919 + N * 104729 + (sim.kills ? sim.kills[0] * 31 + sim.kills[1] : 0)) >>> 0;
  const rnd = mulberry32(seed);
  const rand = (a, b) => a + rnd() * (b - a);
  const pick = (list) => list[Math.floor(rnd() * list.length)];

  /* ---------- 1. le temps : chaque événement a son heure d'arrivée à l'écran ---------- */
  const at = [];
  let tau = 0, prev = 0;
  for (const e of ev) {
    const start = tau;
    tau += at.length ? clamp(Math.max(0, e.t - prev) * PACE, TRAVEL_MIN, TRAVEL_MAX) : clamp(e.t * 30, OPENING[0], OPENING[1]);
    const kills = e.kills.map((k, j) => tau + SHOW_LEAD + KILL_GAP * j);
    const hud = tau + SHOW_LEAD + KILL_GAP * e.kills.length;
    const end = hud + (e.k === 'nexus' ? 1700 : e.kills.length ? 560 : 760);
    at.push({ start, tau, kills, hud, end, t0: prev, t1: e.t });
    tau = end; prev = e.t;
  }
  const total = tau;
  /* numéro de l'événement en cours (ou à venir) à l'instant tau */
  const indexAt = (x) => { let lo = 0, hi = N - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (at[m].end > x) hi = m; else lo = m + 1; } return lo; };
  /** Temps de jeu (secondes) à l'instant tau de la mise en scène. */
  const gameAt = (x) => {
    if (!N) return 0;
    const a = at[indexAt(x)];
    return x >= a.tau ? a.t1 : a.t0 + (a.t1 - a.t0) * clamp((x - a.start) / (a.tau - a.start), 0, 1);
  };
  /** Instant de la mise en scène où l'horloge du jeu atteint g. */
  const tauOfGame = (g) => {
    for (const a of at) if (a.t1 >= g) return g <= a.t0 ? a.start : a.start + (a.tau - a.start) * ((g - a.t0) / (a.t1 - a.t0 || 1));
    return total + (g - prev) * 30;
  };

  /* ---------- 2. l'état de la carte avant chaque événement : phase, tours tombées, ligne de front de chaque voie ---------- */
  const state = [];
  {
    let lost = [[0, 0, 0, 0], [0, 0, 0, 0]], lead = 0;
    const laneState = [0, 0, 0];
    const fronts = (phase) => [0, 1, 2].map((l) => {
      const b = STRUCT_D[l][Math.min(3, lost[0][l])], r = STRUCT_D[l][Math.min(3, lost[1][l])];
      if (phase === 'lane') return clamp(laneState[l] * 26, -Math.min(150, b - 66), Math.min(150, r - 66));
      return clamp((r - b) / 2 + clamp(lead * 7, -50, 50), -(b - 74), r - 74);
    });
    for (let n = 0; n <= N; n++) {
      const t0 = n ? ev[n - 1].t : 0;
      const phase = t0 < LANING_END ? 'lane' : t0 < LATE ? 'mid' : 'late';
      state.push({ t0, phase, lost: [lost[0].slice(), lost[1].slice()], front: fronts(phase), lead, obj: 'bot' });
      if (n === N) break;
      const e = ev[n], l = LANE_INDEX[e.z];
      if (e.st) lost = [e.st[0].slice(), e.st[1].slice()];
      if (l !== undefined && e.s >= 0 && e.t <= LANING_END + 60) laneState[l] += (e.s === 0 ? 1 : -1) * (e.k === 'kill' ? 1.5 : 1);
      lead = (e.g[0] - e.g[1]) / 1000;
    }
    /* le prochain objectif neutre : en bas (dragon) ou en haut (larves, Héraut, Baron) */
    let obj = 'bot';
    for (let n = N; n >= 0; n--) {
      const e = ev[n];
      if (e) { if (e.k === 'dragon' || e.k === 'elder') obj = 'bot'; else if (e.k === 'baron' || e.k === 'herald' || e.k === 'grubs') obj = 'top'; }
      state[n].obj = obj;
    }
  }
  /* tenue de chaque poste hors événement : une place sur une voie, ou la jungle */
  const LANE = (lane, back, lat) => ({ lane, back, lat });
  /* en fin de partie, le midlaner tient une voie de côté s'il joue un champion de duel (combattant, assassin) */
  const sideMid = [0, 1].map((side) => !!(kits[side * 5 + 2] && kits[side * 5 + 2].split));
  function dutyOf(role, s, side) {
    const objLane = s.obj === 'bot' ? 2 : 0, sgn = s.obj === 'bot' ? 1 : -1;
    /* phase de lane : en bas, les supports sont devant, les ADC derrière eux (le virage ne laisse pas de place côte à côte) */
    if (s.phase === 'lane') return [LANE(0, 58, 0), null, LANE(1, 50, 0), LANE(2, 122, -8 * INSIDE[2]), LANE(2, 48, 12 * INSIDE[2])][role];
    /* milieu de partie : l'ADC et le support tiennent le milieu, le midlaner la voie proche du prochain objectif, le toplaner l'autre */
    if (s.phase === 'mid') return [LANE(2 - objLane, 56, 0), null, LANE(objLane, 56, 0), LANE(1, 64, 0), LANE(1, 48, 60 * sgn)][role];
    /* fin de partie : on ne reste pas à cinq au milieu. Le toplaner pousse la voie de côté opposée au prochain objectif (il a sa Téléportation
       pour revenir), le midlaner l'autre s'il joue un champion de duel ; les autres tiennent le milieu, le support devant, l'ADC derrière */
    return [LANE(2 - objLane, 54, 0), LANE(1, 66, -62 * sgn), sideMid[side] ? LANE(objLane, 56, 0) : LANE(1, 76, 44 * sgn), LANE(1, 104, -12 * sgn), LANE(1, 42, 16 * sgn)][role];
  }
  const dutySpot = (i, s) => {
    const d = dutyOf(i % 5, s, i < 5 ? 0 : 1);
    return d ? laneAt(d.lane, s.front[d.lane] + (i < 5 ? -1 : 1) * d.back, d.lat) : null;
  };

  /* ---------- 3. qui est présent à chaque événement, et où ---------- */
  const U = [0.7071, -0.7071];                       // de la base bleue vers la base rouge
  const deadUntil = new Array(10).fill(0), deathAt = new Array(10).fill(0);
  const deaths = Array.from({ length: 10 }, () => []);
  const appts = Array.from({ length: 10 }, () => []);
  const anchors = [], casts = [];
  const baronUntil = [-1, -1];
  const fountainSpot = (i) => { const side = i < 5 ? 0 : 1, r = i % 5, p = [44 + r * 13, 956 - (4 - r) * 13]; return side ? mirror(p) : p; };
  /* temps qu'il faut à un mort pour être à l'heure : le trajet depuis la fontaine, au pas de course */
  const needFrom = (i, spot) => routeLen(fountainSpot(i), spot) / VRUSH + 250;
  const aliveAt = (i, x) => deadUntil[i] <= x;
  /* Le serveur ne suit pas l'expérience : chacun monte au rythme ordinaire de son poste (les joueurs seuls sur leur voie d'abord, le support
     en dernier), un peu plus ou un peu moins vite selon la partie ; un mort n'apprend rien pendant qu'il attend. */
  const levelSpeed = Array.from({ length: 10 }, () => 0.96 + rnd() * 0.08);
  /** Les heures de jeu (secondes) où le joueur i atteint les niveaux 2, 3… compte tenu des morts qu'on lui connaît. */
  function levelTimes(i) {
    const role = i % 5, marks = LEVEL_AT[role];
    const dead = deaths[i].map(([a, b]) => [gameAt(a), gameAt(b)]);
    const lost = (g) => dead.reduce((sum, [a, b]) => sum + (a < g ? Math.min(b, g) - a : 0), 0);
    const out = [];
    for (let L = 2; L <= MAX_LEVEL[role]; L++) {
      let k = 0;
      while (k < LEVEL_MARKS.length - 2 && LEVEL_MARKS[k + 1] < L) k++;
      const l0 = LEVEL_MARKS[k], l1 = LEVEL_MARKS[k + 1];
      const need = (L > 18 ? marks[4] + (L - 18) * AFTER_18 : L <= l0 ? marks[k] * ((L - 1) / (l0 - 1)) : marks[k] + (marks[k + 1] - marks[k]) * ((L - l0) / (l1 - l0))) * levelSpeed[i];
      let g = need;
      for (let pass = 0; pass < 3; pass++) g = need + 0.6 * lost(g);
      out.push(g);
    }
    return out;
  }
  const levelAtGame = (i, g) => { const t = levelTimes(i); let L = 1; while (L <= t.length && t[L - 1] <= g) L++; return L; };

  function towerCast(n) {
    const e = ev[n], def = Number(e.z[2]), lane = Number(e.z[3]), att = 1 - def, s = state[n], when = at[n].tau - 350;
    const p = ev[n - 1];
    /* une tour de base (tour d'inhibiteur, inhibiteur) se prend et se défend à cinq ; avec le Baron, en milieu de partie, on pousse ensemble */
    const five = s.lost[def][lane] >= 2 || (s.phase === 'mid' && baronUntil[att] > e.t);
    let roles;
    /* dans la foulée d'un combat ou d'un objectif gagné : ceux qui y étaient continuent ensemble */
    if (p && e.t - p.t <= 45 && p.s === att && casts[n - 1].filter((i) => (i < 5 ? 0 : 1) === att).length >= 3) roles = casts[n - 1].filter((i) => (i < 5 ? 0 : 1) === att).map((i) => i % 5);
    else if (s.phase === 'lane') roles = lane === 0 ? [0, 1] : lane === 1 ? [2, 1] : [3, 4];
    else if (five) roles = [0, 1, 2, 3, 4];
    /* sinon, ceux qui tiennent cette voie ; leur jungler les y rejoint (pas toujours, sur une voie de côté en fin de partie) */
    else { roles = [0, 2, 3, 4].filter((r) => dutyOf(r, s, att).lane === lane); if (s.phase !== 'late' || lane === 1 || !roles.length || rnd() < 0.5) roles.push(1); }
    let list = roles.map((r) => att * 5 + r).filter((i) => aliveAt(i, when));
    if (!list.length) list = [0, 1, 2, 3, 4].map((r) => att * 5 + r).filter((i) => aliveAt(i, when)).slice(0, 2);
    /* une tour ne tombe pas devant des joueurs qui regardent ailleurs : ceux qui tiennent la voie se replient sous elle,
       leur jungler vient les aider, et face à une poussée à cinq (ou pour une tour de base) toute l'équipe défend */
    const guards = s.phase === 'lane' ? (lane === 0 ? [0] : lane === 1 ? [2] : [3, 4])
      : five || list.length >= 4 ? [0, 1, 2, 3, 4]
        : [0, 2, 3, 4].filter((r) => dutyOf(r, s, def).lane === lane).concat(s.phase !== 'late' || lane === 1 || rnd() < 0.5 ? [1] : []);
    return list.concat(guards.map((r) => def * 5 + r).filter((i) => aliveAt(i, when)));
  }
  /** Range deux groupes face à face autour d'un point : les bleus du côté de leur base, les rouges en face. */
  function faceOff(out, list, a, u, gap = 46, spread = 64, stagger = 36) {
    for (const side of [0, 1]) {
      const group = list.filter((i) => (i < 5 ? 0 : 1) === side), sg = side ? 1 : -1, m = group.length;
      group.forEach((i, k) => {
        const across = (k - (m - 1) / 2) * spread, along = sg * (gap + (m > 3 ? (k % 2) * stagger : 0));
        out.set(i, [a[0] + u[0] * along - u[1] * across, a[1] + u[1] * along + u[0] * across]);
      });
    }
  }
  /** Une équipe seule autour d'une fosse : le jungler dedans, les autres à l'entrée. */
  function aroundPit(out, group, pit, door) {
    const len = dist(pit, door) || 1, o = [(door[0] - pit[0]) / len, (door[1] - pit[1]) / len];
    const jgl = group.find((i) => i % 5 === 1), rest = group.filter((i) => i !== jgl);
    if (jgl !== undefined) out.set(jgl, [pit[0] + o[0] * 10, pit[1] + o[1] * 10]);
    rest.forEach((i, k) => {
      const across = (k - (rest.length - 1) / 2) * 62, away = 66 + (k % 2) * 22;
      out.set(i, [pit[0] + o[0] * away - o[1] * across, pit[1] + o[1] * away + o[0] * across]);
    });
  }
  function spotsOf(n, list) {
    const e = ev[n], s = state[n], z = e.z, out = new Map(), lane = LANE_INDEX[z];
    let anchor = [500, 500];
    if (lane !== undefined && s.phase === 'lane' && list.length <= 5) {
      /* sur une voie : chacun reste de son côté de la ligne de front, là où il se tient d'habitude, un pas plus près */
      const f = s.front[lane];
      anchor = laneAt(lane, f);
      const lanePos = (i) => {
        const d = dutyOf(i % 5, s, i < 5 ? 0 : 1), sg = i < 5 ? -1 : 1;
        if (d && d.lane === lane) return [f + sg * (d.back - 6), d.lat];
        return null;
      };
      if (e.k === 'gank') {
        const j = list[0], victim = list[2], vp = lanePos(victim) || [f + (victim < 5 ? -44 : 44), 0], sv = victim < 5 ? -1 : 1;
        for (const i of list) {
          const p = lanePos(i);
          if (p) out.set(i, laneAt(lane, p[0], p[1]));
        }
        /* le jungler surgit du côté de la rivière, sur le flanc de sa cible ; en cas de contre-gank, l'autre jungler couvre la retraite */
        out.set(j, laneAt(lane, vp[0] + sv * 12, vp[1] + INSIDE[lane] * 64));
        if (list[3] !== undefined) out.set(list[3], laneAt(lane, vp[0] + sv * 62, vp[1] + INSIDE[lane] * 44));
      } else {
        let extra = 0;
        for (const i of list) {
          const p = lanePos(i);
          if (p) out.set(i, laneAt(lane, p[0], p[1]));
          else { out.set(i, laneAt(lane, f + (i < 5 ? -1 : 1) * (70 + extra * 30), INSIDE[lane] * 50)); extra++; }
        }
      }
    } else if (lane !== undefined) {
      anchor = laneAt(lane, s.front[lane]);
      faceOff(out, list, anchor, laneDir(lane, s.front[lane]));
    } else if (z === 'drake' || z === 'baron') {
      const pit = PIT[z], door = z === 'drake' ? NODE.r6 : NODE.r3;
      const sides = [list.filter((i) => i < 5), list.filter((i) => i >= 5)];
      if (!sides[0].length || !sides[1].length || e.k === 'grubs') {
        /* objectif pris sans combat (ou larves partagées) : l'équipe qui prend est dans la fosse */
        const taker = e.s >= 0 ? e.s : sides[0].length ? 0 : 1;
        anchor = pit;
        aroundPit(out, sides[taker], pit, door);
        sides[1 - taker].forEach((i, k) => out.set(i, [door[0] + (taker ? -1 : 1) * U[0] * (96 + k * 40), door[1] + (taker ? -1 : 1) * U[1] * (96 + k * 40)]));
      } else {
        anchor = door;
        faceOff(out, list, door, U, 46, 62);
      }
    } else if (z.slice(0, 2) === 'tw') {
      const def = Number(z[2]), l = Number(z[3]), att = 1 - def;
      /* le bâtiment qui vient de tomber, ou celui qui est attaqué */
      const k = clamp(e.st ? e.st[def][l] - 1 : s.lost[def][l], 0, 3);
      anchor = STRUCT[def][l][k];
      const d = (def ? 1 : -1) * STRUCT_D[l][k], sg = att ? 1 : -1;
      const group = list.filter((i) => (i < 5 ? 0 : 1) === att), guards = list.filter((i) => (i < 5 ? 0 : 1) === def);
      group.forEach((i, j) => out.set(i, laneAt(l, d + sg * (66 + (j % 2) * 32), (j - (group.length - 1) / 2) * 44)));
      guards.forEach((i, j) => out.set(i, laneAt(l, d - sg * (48 + (j % 2) * 30), (j - (guards.length - 1) / 2) * 44)));
    } else if (z === 'base0' || z === 'base1') {
      const def = Number(z[4]);
      if (e.k === 'nexus') {
        /* les vainqueurs autour du Nexus qui explose ; les derniers défenseurs, acculés entre leur Nexus et leur fontaine */
        const c = NEXUS[def], o = def ? [-0.7071, 0.7071] : [0.7071, -0.7071];
        const win = list.filter((i) => (i < 5 ? 0 : 1) !== def), lose = list.filter((i) => (i < 5 ? 0 : 1) === def);
        anchor = c;
        win.forEach((i, k) => { const across = (k - (win.length - 1) / 2) * 50; out.set(i, [c[0] + o[0] * (78 + (k % 2) * 26) - o[1] * across, c[1] + o[1] * (78 + (k % 2) * 26) + o[0] * across]); });
        const back = Math.atan2(-o[1], -o[0]);
        lose.forEach((i, k) => { const ang = back + (k - (lose.length - 1) / 2) * 0.62; out.set(i, [c[0] + Math.cos(ang) * 58, c[1] + Math.sin(ang) * 58]); });
      } else {
        /* devant les tours du Nexus : deux rangs serrés, qui tiennent dans le cœur de la base */
        anchor = def ? [830, 170] : [170, 830];
        faceOff(out, list, anchor, U, 44, 46, 0);
      }
    } else {
      /* dans la rivière ou dans la jungle : du côté du prochain objectif */
      const low = s.obj === 'bot';
      anchor = z === 'river' ? (low ? NODE.r5 : NODE.r4) : z === 'jg0' ? (low ? [520, 716] : [300, 520]) : z === 'jg1' ? (low ? [700, 480] : [480, 284]) : [500, 500];
      faceOff(out, list, anchor, U);
    }
    /* une rangée qui déborderait de la carte (voie collée au bord) est ramenée d'un bloc vers l'intérieur */
    for (const side of [0, 1]) {
      const group = [...out.keys()].filter((i) => (i < 5 ? 0 : 1) === side);
      if (!group.length) continue;
      const xs = group.map((i) => out.get(i)[0]), ys = group.map((i) => out.get(i)[1]);
      const dx = Math.max(0, 48 - Math.min(...xs)) - Math.max(0, Math.max(...xs) - 952), dy = Math.max(0, 48 - Math.min(...ys)) - Math.max(0, Math.max(...ys) - 952);
      if (dx || dy) for (const i of group) { const p = out.get(i); out.set(i, [p[0] + dx, p[1] + dy]); }
    }
    /* deux joueurs ne se tiennent jamais l'un sur l'autre : on les écarte un peu s'il le faut */
    const ids = [...out.keys()];
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++) {
        const p = out.get(ids[x]), q = out.get(ids[y]), d = dist(p, q);
        if (d >= 54) continue;
        const ux = d > 0.5 ? (q[0] - p[0]) / d : 0.7071, uy = d > 0.5 ? (q[1] - p[1]) / d : 0.7071, push = (56 - d) / 2;
        out.set(ids[x], [p[0] - ux * push, p[1] - uy * push]);
        out.set(ids[y], [q[0] + ux * push, q[1] + uy * push]);
        moved = true;
      }
      if (!moved) break;
    }
    for (const [i, p] of out) out.set(i, [clamp(p[0], 40, 960), clamp(p[1], 40, 960)]);
    return { anchor, spots: out };
  }
  const OBJECTIVE = { dragon: 1, elder: 1, baron: 1, herald: 1, grubs: 1 };
  function marginOf(e, i, n) {
    const role = i % 5, lane = LANE_INDEX[e.z];
    if (e.k === 'gank') return role === 1 ? 70 : 260;
    if (lane !== undefined && state[n].phase === 'lane') return role === 1 ? 120 : 280;
    if (OBJECTIVE[e.k]) return role === 1 ? 1350 : role === 4 ? 1050 : 420 + role * 110;
    if (e.k === 'kill') return e.kills.length && e.kills[0][1] === i ? 800 : 90 + role * 40;
    if (e.z.slice(0, 2) === 'tw') return 320 + role * 70;
    return 160 + role * 75;
  }

  /* le serveur suit-il les ultimes ? (il donne alors, pour chaque action, ceux qui lancent le leur : u ; ceux que leur ultime amène de
     l'autre bout de la carte : jn ; ceux qui le lancent de loin sans être là : fr) */
  const served = ev.some((e) => e.u);
  for (let n = 0; n < N; n++) {
    const e = ev[n], a = at[n];
    let list;
    if (e.who.length) {
      /* le serveur ne tient pas le compte des temps de mort : un joueur encore mort ne vient que s'il prend part aux éliminations */
      const involved = new Set();
      for (const k of e.kills) { involved.add(k[0]); involved.add(k[1]); for (const h of k[2]) involved.add(h); }
      list = [...new Set(e.who)].filter((i) => aliveAt(i, a.tau - 500) || involved.has(i));
      /* l'assaut final : tous les défenseurs encore debout sont dans leur base, pas seulement ceux qui vont tomber */
      if (e.z.slice(0, 4) === 'base' && e.k === 'tower') {
        const def = Number(e.z[4]);
        for (let r = 0; r < 5; r++) { const i = def * 5 + r; if (!list.includes(i) && aliveAt(i, a.tau - 500)) list.push(i); }
      }
    }
    else if (e.k === 'nexus') {
      /* les vainqueurs, et ce qu'il reste de défenseurs */
      list = (casts[n - 1] || []).filter((i) => (i < 5 ? 0 : 1) === e.s && aliveAt(i, a.tau));
      for (let r = 0; r < 5; r++) { const i = (1 - e.s) * 5 + r; if (aliveAt(i, a.tau)) list.push(i); }
    }
    else if (e.z.slice(0, 2) === 'tw') list = towerCast(n);
    else list = [];
    const { anchor, spots } = spotsOf(n, list);
    /* un joueur que le serveur fait jouer alors qu'il serait encore mort revient un peu plus tôt */
    for (const i of list) {
      if (deadUntil[i] > 0 && deadUntil[i] > a.tau - needFrom(i, spots.get(i))) {
        const d = deaths[i][deaths[i].length - 1];
        deadUntil[i] = Math.max(deathAt[i] + 600, Math.min(deadUntil[i], a.tau - needFrom(i, spots.get(i))));
        if (d) d[1] = deadUntil[i];
      }
    }
    anchors.push(anchor); casts.push(list);
    const victims = new Map();
    e.kills.forEach((k, j) => { if (!victims.has(k[1])) victims.set(k[1], a.kills[j]); });
    /* (celui que son ultime amène sur place n'a pas à venir à pied : il arrive au moment où l'action commence) */
    for (const i of list) { const fly = !!(e.jn && e.jn.includes(i)); appts[i].push({ n, spot: spots.get(i), margin: fly ? 60 : marginOf(e, i, n), dies: victims.get(i), fly }); }
    for (const [v, when] of victims) {
      /* le vrai temps de mort : selon son niveau et l'heure de la partie (une dizaine de secondes au début, près d'une minute à la fin) */
      const back = Math.max(when + 1000, tauOfGame(e.t + deathTime(levelAtGame(v, e.t), e.t)));
      deathAt[v] = when; deadUntil[v] = back;
      deaths[v].push([when, back]);
      /* une victime que le serveur ne citait pas parmi les présents meurt là où elle se trouve : rare, on l'y convoque quand même */
      if (!list.includes(v)) appts[v].push({ n, spot: null, margin: 0, dies: when });
    }
    if (e.k === 'baron' && e.s >= 0) baronUntil[e.s] = e.t + 180;
    /* le perdant d'un duel de voie rentre à la base */
    if (e.k === 'duel' && LANE_INDEX[e.z] !== undefined && e.s >= 0 && list.length >= 2) {
      const loser = list.find((i) => (i < 5 ? 0 : 1) !== e.s);
      const mine = appts[loser] && appts[loser][appts[loser].length - 1];
      if (mine && mine.n === n) mine.recall = true;
    }
  }

  /* ---------- 4. les camps : qui les a tués, et quand ils reviennent ---------- */
  const campDown = new Map(CAMPS.map((c) => [c.id, []]));
  const campSpawn = new Map(CAMPS.map((c) => [c.id, tauOfGame(c.spawn)]));
  const campReady = (c, x, hold) => {
    /* instant à partir duquel le camp est debout pour ce passage ; Infinity s'il est pris par l'autre jungler */
    let start = Math.max(x, campSpawn.get(c.id));
    for (const [d0, d1] of [...campDown.get(c.id)].sort((a, b) => a[0] - b[0])) {
      if (start + hold <= d0 - 250) {
        /* on passerait avant l'autre jungler : il faut que le camp ait le temps de revenir pour lui */
        if (tauOfGame(gameAt(start + hold) + c.respawn) > d0 - 1100) return Infinity;
        break;
      }
      start = Math.max(start, d1);
    }
    return start;
  };

  /* ---------- 5. les niveaux ---------- */
  /* (leur rythme est réglé plus haut ; ici les instants définitifs, toutes les morts étant connues) */
  const levels = Array.from({ length: 10 }, (x, i) => levelTimes(i).map(tauOfGame));
  /** Le niveau du joueur i à l'instant tau. */
  const levelAt = (i, x) => { const t = levels[i]; let L = 1; while (L <= t.length && t[L - 1] <= x) L++; return L; };

  /* ---------- 6. les ultimes ---------- */
  /* Le serveur ne suit pas les sorts : la mise en scène en tire une histoire plausible. Chacun obtient son ultime au niveau 6 (d'emblée pour
     les quelques champions dont le R sert dès le niveau 1), le lance dans les actions où il compte, puis attend qu'il revienne : le vrai délai
     de récupération de son ultime, à son rang (niveaux 6, 11 et 16), raccourci par l'accélération de compétence que donnent les objets. */
  /* Quand le serveur suit les ultimes, c'est lui qui décide : chacun lance le sien là où il l'a dit, et nulle part ailleurs — sauf les
     quelques ultimes qui s'utilisent en continu (moins de 45 secondes de recharge : Corki, Kog'Maw, les changements de forme, le Mantra
     de Karma…), que le serveur ne compte pas un par un. Le délai affiché est le vrai, sans l'accélération des objets, comme au serveur. */
  const ALWAYS = 45;
  const ults = [];
  for (let i = 0; i < 10; i++) {
    const kit = kits[i] || {}, cds = kit.cd && kit.cd.length ? kit.cd : [120, 100, 80];
    let from = kit.early ? 0 : levels[i][4];
    const used = [];
    if (served && Math.max(...cds) > ALWAYS) {
      for (let n = 0; n < N; n++) {
        const e = ev[n], a = at[n];
        if (!e.u || !e.u.includes(i)) continue;
        const A = appts[i].find((x) => x.n === n);
        const mine = e.kills.findIndex((k) => k[0] === i || k[1] === i || k[2].includes(i));
        /* lancé au cœur de l'action : juste avant l'élimination à laquelle il prend part, sinon au début — et toujours avant sa propre mort */
        let when = mine >= 0 ? a.kills[mine] - 260 : a.tau + rand(60, SHOW_LEAD);
        if (A && A.dies !== undefined) when = Math.min(when, A.dies - 120);
        const last = used[used.length - 1];
        if (last) when = Math.max(when, last[0] + 200);
        const lv = levelAt(i, when), rank = (lv >= 16 ? 2 : lv >= 11 ? 1 : 0) + (kit.early && cds.length > 3 ? 1 : 0);
        used.push([when, tauOfGame(gameAt(when) + cds[Math.min(rank, cds.length - 1)])]);
      }
      /* le serveur a pu le relancer un peu plus tôt (dragons Hextech) : il est prêt, au plus tard, juste avant son lancer suivant ;
         et il l'a appris, au plus tard, à son premier lancer */
      for (let k = 0; k + 1 < used.length; k++) if (used[k][1] > used[k + 1][0] - 1) used[k][1] = used[k + 1][0] - 1;
      if (used.length) from = Math.min(from, used[0][0] - 1);
      ults.push({ from, used });
      continue;
    }
    let ready = from;
    for (const A of appts[i]) {
      const n = A.n, e = ev[n], a = at[n];
      if (ready > a.tau) continue;
      const mine = e.kills.findIndex((k) => k[0] === i || k[1] === i || k[2].includes(i));
      const fought = e.kills.length > 0;
      const odds = e.k === 'nexus' ? 0 : mine >= 0 ? 0.88 : e.k === 'fight' ? 0.8 : fought ? 0.6
        : e.k === 'gank' ? (casts[n][0] === i ? 0.7 : 0.4) : e.k === 'duel' ? (LANE_INDEX[e.z] !== undefined ? 0.33 : 0.15) : 0.05;
      if (rnd() >= odds) continue;
      /* lancé au cœur de l'action : juste avant l'élimination à laquelle il prend part, sinon au début du combat */
      const when = Math.max(ready, mine >= 0 ? a.kills[mine] - 260 : a.tau + rand(60, SHOW_LEAD));
      if (A.dies !== undefined && when > A.dies) continue;
      const lv = levelAt(i, when), rank = (lv >= 16 ? 2 : lv >= 11 ? 1 : 0) + (kit.early && cds.length > 3 ? 1 : 0);
      const haste = clamp((e.t - 420) / 27, 0, 45);
      ready = tauOfGame(gameAt(when) + (cds[Math.min(rank, cds.length - 1)] * 100) / (100 + haste));
      used.push([when, ready]);
    }
    ults.push({ from, used });
  }
  /** L'ultime du joueur i est-il disponible à l'instant tau ? */
  const ultReady = (i, x) => {
    const u = ults[i];
    if (x < u.from) return false;
    for (const [a, b] of u.used) { if (x < a) return true; if (x < b) return false; }
    return true;
  };

  /* ---------- les sorts d'invocateur ---------- */
  /* Là encore le serveur ne les suit pas. Chacun a les deux sorts que les pros prennent sur son champion ; il s'en sert dans les actions où ils
     comptent — le Saut éclair pour fuir ou pour conclure, l'Embrasement pour achever, les Soins et la Barrière quand ça chauffe, le Châtiment
     sur les objectifs — puis attend leur vrai délai de récupération. La Téléportation, elle, sert dans les trajets (plus bas). */
  const sums = Array.from({ length: 10 }, (x, i) => ((kits[i] && kits[i].sums) || []).slice(0, 2).map(([id, cd]) => ({ id, cd, used: [] })));
  const sumOf = (i, id) => sums[i].find((s) => s.id === id);
  const sumFree = (i, id, when) => { const s = sumOf(i, id), last = s && s.used[s.used.length - 1]; return !!s && (!last || last[1] <= when); };
  const sumUse = (i, id, when) => { if (!sumFree(i, id, when)) return false; const s = sumOf(i, id); s.used.push([when, tauOfGame(gameAt(when) + s.cd)]); return true; };
  for (let i = 0; i < 10; i++) {
    if (!sums[i].length) continue;
    const side = i < 5 ? 0 : 1;
    for (const A of appts[i]) {
      const n = A.n, e = ev[n], a = at[n];
      if (e.k === 'nexus') continue;
      const fought = e.kills.length, won = e.s === side, dies = A.dies !== undefined;
      const mine = e.kills.findIndex((k) => k[0] === i), helped = e.kills.some((k) => k[0] === i || k[2].includes(i));
      const when = dies ? Math.max(a.tau, A.dies - 220) : mine >= 0 ? Math.max(a.tau, a.kills[mine] - 180) : a.tau + rand(80, SHOW_LEAD);
      /* les chances qu'il s'en serve ici, sort par sort */
      const odds = {
        F: dies ? 0.55 : e.k === 'gank' && !fought && casts[n][2] === i ? 0.85 : fought >= 2 && !won ? 0.45 : mine >= 0 ? 0.3 : e.k === 'duel' && !won && LANE_INDEX[e.z] !== undefined ? 0.2 : 0.03,
        I: helped ? 0.75 : fought ? 0.2 : 0,
        H: dies ? 0.7 : fought ? (won ? 0.35 : 0.6) : 0,
        B: dies ? 0.7 : fought ? (won ? 0.3 : 0.6) : 0,
        E: fought ? 0.55 : e.k === 'gank' ? 0.3 : 0,
        C: dies ? 0.5 : fought >= 2 ? 0.45 : 0,
        G: fought >= 2 ? 0.6 : fought ? 0.35 : 0,
        S: OBJECTIVE[e.k] && i % 5 === 1 ? 1 : 0,
      };
      for (const s of sums[i]) if ((odds[s.id] || 0) > 0 && rnd() < odds[s.id]) sumUse(i, s.id, when);
    }
  }
  /** Secondes de jeu avant que le sort n° « slot » du joueur i soit de nouveau prêt, à l'instant tau (0 : il l'est). */
  const sumLeft = (i, slot, x) => {
    const s = sums[i][slot];
    if (!s) return 0;
    for (const [a, b] of s.used) { if (x < a) return 0; if (x < b) return Math.max(0, gameAt(b) - gameAt(x)); }
    return 0;
  };

  /* ---------- 7. la vie et la ressource ---------- */
  /* Le serveur ne compte ni les points de vie ni le mana : la mise en scène en tire une histoire plausible, écrite au fil du trajet de chacun.
     On perd de la vie dans les actions où l'on se trouve (beaucoup quand on les perd, tout quand on y meurt) ; elle remonte doucement, et un
     retour à la base la rend. La ressource dépend du champion : le mana se dépense et revient lentement, l'énergie revient vite, la rage
     (fureur, vapeur, impulsion…) monte quand on se bat et retombe ensuite ; certains champions n'ont rien.
     Chaque courbe est une suite de points [instant, part de 0 à 1], reliés par des droites. */
  function vitalsOf(i) {
    const res = (kits[i] && kits[i].res) || 'mana';
    const hp = [[0, 1]], mp = [[0, res === 'build' ? 0 : 1]];
    const now = (keys) => keys[keys.length - 1];
    /* laisse filer le temps jusqu'à x : la valeur monte (ou descend) de « rate » par seconde de jeu, sans sortir de 0 à 1 */
    const glide = (keys, x, rate) => {
      const [t0, v0] = now(keys);
      if (x <= t0 + 1e-6) return;
      const g0 = gameAt(t0), v1 = v0 + rate * (gameAt(x) - g0);
      if (v1 > 1 || v1 < 0) {
        const edge = v1 > 1 ? 1 : 0, reach = tauOfGame(g0 + (edge - v0) / rate);
        if (reach > t0 + 1e-6 && reach < x) keys.push([reach, edge]);
        keys.push([x, edge]);
      } else keys.push([x, v1]);
    };
    const part = (x) => clamp(gameAt(x) / 1500, 0, 1);
    const to = (x) => {
      glide(hp, x, 0.002 + 0.003 * part(now(hp)[0]));
      if (res !== 'none') glide(mp, x, res === 'energy' ? 0.05 : res === 'build' ? -0.03 : 0.0028 + 0.0045 * part(now(mp)[0]));
    };
    const set = (keys, x, v) => { keys.push([Math.max(x, now(keys)[0]), clamp(v, 0, 1)]); };
    return {
      hp, mp,
      /** Retour à la base, réapparition : tout est rendu. */
      full(x) { to(x); set(hp, x, 1); if (res !== 'none') set(mp, x, res === 'build' ? 0 : 1); },
      /** Un camp de la jungle, de x0 à x1 : un peu de vie au début de la partie, un peu de mana ; la rage monte. */
      camp(x0, x1) {
        to(x0);
        set(hp, x1, now(hp)[1] - (gameAt(x1) < 330 ? rand(0.05, 0.1) : rand(0.01, 0.04)));
        if (res === 'mana') set(mp, x1, now(mp)[1] * (1 - rand(0.05, 0.2)));
        else if (res === 'energy') set(mp, x1, rand(0.45, 0.9));
        else if (res === 'build') set(mp, x1, now(mp)[1] + rand(0.25, 0.5));
      },
      /** Un moment passé sur sa voie (sbires, sorts échangés), jusqu'à x. */
      work(x) {
        to(x);
        if (res === 'mana') set(mp, x, now(mp)[1] * (1 - rand(0, 0.14)));
        else if (res === 'energy') set(mp, x, Math.min(now(mp)[1], rand(0.5, 1)));
        else if (res === 'build') set(mp, x, now(mp)[1] + rand(0.08, 0.4));
      },
      /** Une action dont il sort vivant, de x0 à x1 : il y laisse « hit » de sa vie. Renvoie ce qu'il lui en reste. */
      fight(x0, x1, hit, hard) {
        to(x0);
        const left = Math.max(rand(0.05, 0.13), now(hp)[1] - hit);
        set(hp, x1, Math.min(left, now(hp)[1]));
        if (res === 'mana') set(mp, x1, Math.max(0.03, now(mp)[1] - (hard ? rand(0.2, 0.42) : rand(0.08, 0.22))));
        else if (res === 'energy') set(mp, (x0 + x1) / 2, rand(0.1, 0.45));
        else if (res === 'build') { set(mp, x0 + (x1 - x0) * 0.35, hard ? rand(0.7, 1) : rand(0.4, 0.8)); set(mp, x1, now(mp)[1]); }
        return now(hp)[1];
      },
      /** Il meurt à l'instant « dies » d'une action commencée en x0, et revient en « back ». */
      die(x0, dies, back) {
        to(x0);
        if (res === 'build') set(mp, x0 + (dies - x0) * 0.5, rand(0.6, 1));
        else if (res === 'mana') set(mp, dies, Math.max(0.02, now(mp)[1] - rand(0.15, 0.4)));
        set(hp, dies, 0);
        set(hp, back, 0); set(hp, back, 1);
        if (res !== 'none') { set(mp, back, now(mp)[1]); set(mp, back, res === 'build' ? 0 : 1); }
      },
      end(x) { to(x); },
    };
  }
  /** La valeur d'une courbe à l'instant x. */
  const valueAt = (keys, x) => {
    let lo = 0, hi = keys.length - 1;
    if (x >= keys[hi][0]) return keys[hi][1];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (keys[m][0] <= x) lo = m; else hi = m; }
    const a = keys[lo], b = keys[hi];
    return b[0] <= a[0] ? b[1] : a[1] + (b[1] - a[1]) * ((x - a[0]) / (b[0] - a[0]));
  };

  /* ---------- l'or de chacun ---------- */
  /* (compté avant les trajets : ce qu'un joueur a en poche décide de ses retours à la base) */
  const econ = planGold({ ev, at, casts, state, deaths, gameAt, tauOfGame, levelAtGame, kits, duration: sim.duration, total, seed, final: sim.players });

  /* ---------- 8. le trajet de chaque joueur ---------- */
  const tracks = [], life = [], mana = [];
  const stats = { camps: [0, 0], rushes: 0, late: 0, recalls: 0, tps: 0, flights: 0 };
  for (let i = 0; i < 10; i++) {
    const side = i < 5 ? 0 : 1, role = i % 5, sg = side ? 1 : -1, home = fountainSpot(i);
    const keys = [{ t: 0, x: home[0], y: home[1], k: 'h' }];
    const cur = { t: 0, p: home };
    /* chacun a son allure, pour que deux joueurs qui font le même chemin ne se superposent pas */
    const pace = 0.93 + rnd() * 0.14;
    let queue = [], cleared = 0, lastHover = null, opened = false, tpAt = -Infinity;
    const vit = vitalsOf(i);
    /* à la fontaine, avant de partir : son objet de départ */
    econ.shop(i, 0);
    /* la Téléportation, pour qui l'a prise (sans « kits » : le toplaner, toutes les cinq minutes de jeu). Passé la phase de lane, elle sert à
       rejoindre une action lointaine ; avant, à regagner sa voie */
    const hasTp = sums[i].length ? !!sumOf(i, 'T') : role === 0;
    const tpFree = (x) => (sums[i].length ? sumFree(i, 'T', x) : gameAt(x) - tpAt >= 300);
    const tpUse = (x) => { if (sums[i].length) sumUse(i, 'T', x); else tpAt = gameAt(x); stats.tps++; };
    const canTp = (x) => hasTp && gameAt(x) > LANING_END && tpFree(x - TP_COST);
    /** Après une mort en phase de lane : il regagne sa voie à la Téléportation — c'est à cela qu'elle sert le plus, en début de partie.
        until : l'instant où il doit être libre de ses mouvements (son prochain rendez-vous). */
    function laneTp(until) {
      const s = sOf(cur.t), duty = dutyOf(role, s, side);
      if (!hasTp || !duty || s.phase !== 'lane' || gameAt(cur.t) < 200 || !tpFree(cur.t + 260) || cur.t + 1100 > until || rnd() >= 0.7) return;
      const spot = laneAt(duty.lane, s.front[duty.lane] + sg * (duty.back + 70), duty.lat);
      if (routeLen(home, spot) < 500) return;
      stay(cur.t + 260, 'h');
      tpUse(cur.t);
      stay(cur.t + TP_COST - 110, 't');
      jump(spot);
      stay(cur.t + 120, 'h');
    }
    const push = (t, p, k = 'h') => { keys.push({ t, x: p[0], y: p[1], k }); cur.t = t; cur.p = p; };
    /* ses chemins : dans la base adverse, il n'entre que par une voie ouverte — celles dont l'inhibiteur sera tombé quand commencera
       l'événement où il se rend (aim : l'état de la carte à ce moment-là) */
    const foe = 1 - side;
    let aim = state[0];
    const ways = () => { const s = aim; if (!s.ways) s.ways = [null, null]; return s.ways[side] || (s.ways[side] = siegeRouter(foe, [0, 1, 2].map((l) => s.lost[foe][l] >= 4))); };
    const route = (a, b) => ways().route(a, b), routeLen = (a, b) => ways().routeLen(a, b);
    const kind = (k) => { keys[keys.length - 1].k = k; };
    const stay = (until, k = 'h') => { if (until > cur.t + 1) { kind(k); push(until, cur.p); } };
    const walkPath = (path, speed, k = 'w') => {
      kind(k);
      let t = cur.t;
      for (let j = 1; j < path.length; j++) { t += dist(path[j - 1], path[j]) / speed; push(t, path[j], k); }
      kind('h');
    };
    const jump = (p) => push(cur.t, p);
    const sOf = (x) => state[Math.min(N, indexAt(x) + (N && x >= at[N - 1].end ? 1 : 0))];

    /* --- jungle : la meilleure suite de camps d'ici le prochain rendez-vous --- */
    function planCamps(deadline, target) {
      const mine = CAMPS_OF[side], between = CAMP_PATHS[side];
      const fromHere = mine.map((c) => routeLen(cur.p, c.p));
      const toTarget = target ? mine.map((c) => routeLen(c.p, target)) : null;
      const late = sOf(cur.t).phase === 'late', group = late ? dutySpot(i, sOf(cur.t)) : null;
      /* le tout premier camp de la partie est un buff, comme dans une vraie partie */
      const buffFirst = !opened;
      let best = null;
      const seq = [];
      const walk = (k, t, walked) => {
        const len = seq.length;
        if (len) {
          const last = seq[len - 1];
          const cost = walked + (toTarget ? toTarget[last] * 0.6 : 0);
          if (!best || len > best.seq.length || (len === best.seq.length && cost < best.cost)) best = { seq: seq.slice(), cost };
        }
        if (len >= 6) return;
        const cands = [];
        for (let c = 0; c < mine.length; c++) {
          if (seq.includes(c)) continue;
          const camp = mine[c], d = k < 0 ? fromHere[c] : between[k][c];
          if (buffFirst && !len && camp.kind !== 'blue' && camp.kind !== 'red') continue;
          /* en fin de partie, le jungler ne s'éloigne plus de son équipe */
          if (group && dist(camp.p, group) > 330) continue;
          let arrive = t + d / V;
          const ready = campReady(camp, arrive, camp.hold);
          if (ready > arrive + 700) continue;
          arrive = Math.max(arrive, ready);
          const end = arrive + camp.hold;
          if (end + (toTarget ? toTarget[c] / VFAST : 0) > deadline - 120) continue;
          cands.push([d, c, end]);
        }
        /* on ne regarde que les quatre camps les plus proches : un jungler ne traverse pas la carte pour un camp */
        cands.sort((x, y) => x[0] - y[0]);
        for (const [d, c, end] of cands.slice(0, 4)) {
          seq.push(c);
          walk(c, end, walked + d);
          seq.pop();
        }
      };
      walk(-1, cur.t, 0);
      queue = best ? best.seq.map((c) => mine[c]) : [];
      if (queue.length) opened = true;
    }
    /* Faut-il rentrer acheter ? Oui s'il a de quoi faire un bel achat et le temps d'être revenu là où on l'attend (spot) — au pas de course
       s'il a beaucoup d'or sur lui : on ne se promène pas avec trois mille pièces d'or en poche. */
    const shopTrip = (deadline, spot) => {
      if (!econ.wants(i, cur.t)) return false;
      const rich = econ.pocketAt(i, cur.t) >= 2200;
      return cur.t + 1000 + (spot ? routeLen(home, spot) / (rich ? VRUSH : VFAST) : 900) < deadline - (rich ? 60 : 250);
    };
    function jungleAction(deadline, target) {
      /* (il reprendra ses camps ensuite) */
      if (shopTrip(deadline, target)) { queue = []; return { recall: true, cost: 1000, sure: true }; }
      if (!queue.length) planCamps(deadline, target);
      const camp = queue.shift();
      if (camp) {
        /* il se place à côté du camp, du côté d'où il arrive */
        const path = route(cur.p, camp.p), from = path[path.length - 2] || cur.p, len = dist(from, camp.p) || 1;
        const stand = len < 40 ? cur.p : [camp.p[0] + ((from[0] - camp.p[0]) / len) * 36, camp.p[1] + ((from[1] - camp.p[1]) / len) * 36];
        const arrive = cur.t + routeLen(cur.p, stand) / V;
        const ready = campReady(camp, arrive, camp.hold);
        if (ready === Infinity) { queue = []; return null; }
        return {
          p: stand, speed: V, until: ready, dwell: camp.hold, kind: 'c', camp: camp.id,
          done: (t) => { campDown.get(camp.id).push([t, tauOfGame(gameAt(t) + camp.respawn), i]); cleared++; stats.camps[side]++; vit.camp(t - camp.hold, t); },
        };
      }
      const s = sOf(cur.t);
      if (s.phase === 'late') { const p = dutySpot(i, s); return { p: [p[0] + rand(-12, 12), p[1] + rand(-12, 12)], speed: dist(cur.p, p) > 70 ? V : VSLOW, dwell: rand(500, 1000), kind: 'h' }; }
      /* plus rien à tuer : retour à la base après un tour complet de jungle, sinon il surveille une voie depuis un buisson */
      if (cleared >= 5 && deadline - cur.t > 3200) {
        return { recall: true, cost: 700 + 300 };
      }
      const low = s.obj === 'bot';
      /* (la jungle rouge est le reflet de la bleue : ses sentiers du bas portent les noms de ceux du haut) */
      const names = low !== !!side ? ['g9', 'g8', 'ub', 'g7', 'g3'] : ['g5', 'g4', 'tb', 'g1', 'g3'];
      const spots = names.map((k) => NODE[k + side]).concat(low ? [NODE.r5, NODE.r6] : [NODE.r4, NODE.r3]).filter((p) => !lastHover || dist(p, lastHover) > 60);
      const p = spots.map((q) => [routeLen(cur.p, q) + rand(0, 160), q]).sort((a, b) => a[0] - b[0])[0][1];
      lastHover = p;
      return { p, speed: V * 0.9, dwell: rand(800, 1400), kind: 'h' };
    }
    /* --- voie : de petits pas autour de sa place, de temps en temps une balise posée dans la rivière --- */
    function laneAction(duty, s, deadline, target) {
      const f = s.front[duty.lane];
      if (shopTrip(deadline, target || laneAt(duty.lane, f + sg * duty.back, duty.lat))) return { recall: true, cost: 1000, sure: true };
      if (role === 4 && s.phase !== 'late' && s.t0 > 280 && rnd() < (s.phase === 'lane' ? 0.13 : 0.3)) {
        const low = s.phase === 'lane' ? true : s.obj === 'bot';
        const p = pick(low ? [NODE.r7, NODE.r8, NODE.r6, NODE[(side ? 'tb' : 'ub') + side]] : [NODE.r2, NODE.r3, NODE.r4, NODE[(side ? 'ub' : 'tb') + side]]);
        if (routeLen(cur.p, p) < 420) return { p: [p[0] + rand(-10, 10), p[1] + rand(-10, 10)], speed: V, dwell: rand(450, 700), kind: 'h' };
      }
      const p = laneAt(duty.lane, f + sg * (duty.back + rand(-15, 15)), duty.lat + rand(-9, 9));
      const far = dist(cur.p, p) > 60;
      return { p, speed: far ? V : VSLOW, dwell: far ? rand(150, 350) : rand(450, 1050), kind: 'h', done: far ? null : (t) => vit.work(t) };
    }
    function nextAction(deadline, target) {
      const s = sOf(cur.t), duty = dutyOf(role, s, side);
      return duty ? laneAction(duty, s, deadline, target) : jungleAction(deadline, target);
    }
    /** Rentrer à la base : une incantation sur place, puis le joueur réapparaît à la fontaine. */
    function recall() {
      stay(cur.t + 450, 'r');
      stay(cur.t + 250, 'g');
      jump(home);
      vit.full(cur.t);
      /* à la boutique : il achète ce qu'il peut */
      econ.shop(i, cur.t);
      stay(cur.t + 300, 'h');
      cleared = 0;
      stats.recalls++;
    }
    /** Occupe le joueur jusqu'à « deadline », où il doit se trouver à « target » (ou n'importe où si target est nul).
        fly : son ultime l'y amène de l'autre bout de la carte (le serveur l'a décidé) — il n'a pas à venir à pied. */
    function routine(deadline, target, sneak, fly) {
      queue = [];
      /* (on ne se téléporte pas au cœur de la base adverse : il y entrera à pied, par une voie ouverte) */
      const tp = !!target && !fly && canTp(deadline) && dist(target, NEXUS[foe]) >= HEART;
      for (let guard = 0; guard < 600 && cur.t < deadline - 150; guard++) {
        const act = nextAction(deadline, target);
        if (!act) break;
        if (act.recall) {
          if (!act.sure && cur.t + act.cost + (target ? routeLen(home, target) / VFAST : 0) > deadline - 100) break;
          recall();
          continue;
        }
        const speed = act.speed * (act.speed === V ? pace : 1);
        const path = route(cur.p, act.p), w = pathLen(path) / speed;
        /* le temps qu'il lui faudra ensuite pour rejoindre son rendez-vous : à pied, ou d'une Téléportation s'il est loin et qu'il l'a */
        const far = target ? routeLen(act.p, target) : 0;
        const back = fly ? Math.min(far / VFAST, FLY_COST + 80) : tp && far > TP_MIN ? TP_COST + 80 : far / VFAST;
        if (Math.max(cur.t + w, act.until || 0) + act.dwell + back > deadline) { queue = []; break; }
        walkPath(path, speed);
        /* le camp n'est pas encore revenu : il l'attend */
        if (act.until) stay(act.until, 'h');
        stay(cur.t + act.dwell, act.kind);
        if (act.done) act.done(cur.t);
      }
      if (!target) { stay(deadline, 'h'); return; }
      const path = route(cur.p, target), len = pathLen(path), left = deadline - cur.t;
      if (len < 2) { stay(deadline, 'h'); return; }
      /* son ultime l'amène sur place : un court élan là où il se trouve, puis il surgit au cœur de l'action */
      if (fly && len / VFAST > left - 40) {
        const cost = Math.min(FLY_COST, left);
        stay(deadline - cost, 'h');
        stay(deadline - Math.min(90, cost / 3), 't');
        jump(target);
        stay(deadline, 'h');
        stats.flights++;
        return;
      }
      /* trop loin pour arriver à pied : le toplaner incante sa Téléportation et apparaît auprès des siens */
      if (tp && len > TP_MIN && len / VFAST > left - 40) {
        const cost = Math.min(TP_COST, left);
        stay(deadline - cost, 'h');
        tpUse(cur.t);
        stay(deadline - Math.min(110, cost / 3), 't');
        jump(target);
        stay(deadline, 'h');
        return;
      }
      /* un gank : le jungler attend caché au dernier tournant, puis fonce */
      if (sneak && path.length > 2) {
        const last = dist(path[path.length - 2], path[path.length - 1]), dash = last / VRUSH;
        const before = path.slice(0, -1), lenBefore = pathLen(before);
        if (last > 50 && lenBefore / V + 380 + dash <= left) {
          stay(deadline - dash - 380 - lenBefore / V, 'h');
          walkPath(before, V);
          stay(deadline - dash, 'h');
          walkPath([cur.p, target], VRUSH, 'd');
          return;
        }
      }
      if (len / V <= left) { stay(deadline - len / V, 'h'); walkPath(path, V); return; }
      /* il faut presser le pas */
      const speed = Math.min(VMAX, len / Math.max(1, left));
      if (speed > VRUSH) stats.rushes++;
      if (speed >= VMAX) stats.late++;
      walkPath(path, speed, speed > VFAST ? 'd' : 'w');
    }

    /* au coup d'envoi, les joueurs ne quittent pas la fontaine tous au même instant */
    stay(60 + role * 70 + rnd() * 260, 'h');
    for (const A of appts[i]) {
      const a = at[A.n], e = ev[A.n];
      aim = state[A.n];
      if (A.spot) {
        /* il arrive en avance de « margin » ; s'il vient de loin, il a jusqu'au début de l'événement */
        const soonest = cur.t + routeLen(cur.p, A.spot) / VFAST;
        routine(Math.max(cur.t, Math.min(a.tau, Math.max(a.tau - A.margin, soonest))), A.spot, e.k === 'gank' && role === 1, A.fly);
      } else routine(Math.max(cur.t, a.tau), null, false);
      stay(a.tau, 'h');
      if (A.dies !== undefined) {
        const d = deaths[i].find((x) => x[0] === A.dies), back = d ? d[1] : A.dies + 1500;
        vit.die(a.tau, A.dies, back);
        stay(A.dies, 'f');
        kind('x');
        push(back, cur.p);
        jump(home);
        /* il réapparaît à la fontaine : un passage à la boutique */
        econ.shop(i, cur.t);
        cleared = 0;
        {
          const next = appts[i][appts[i].indexOf(A) + 1];
          laneTp(next ? at[next.n].tau - (next.spot ? next.margin + 600 : 0) : total);
        }
        continue;
      }
      /* ce que l'action lui coûte de vie : peu quand on prend une tour ou un objectif laissé libre, beaucoup quand on perd un combat */
      const won = e.s === side, fought = e.kills.length > 0, siege = e.z.slice(0, 2) === 'tw';
      /* celui qu'un allié a sauvé de justesse, ou à qui son passif vient d'offrir une seconde vie (le serveur le dit : x) : il n'en reste presque rien */
      const spared = e.x === 'save' || e.x === 'life' ? casts[A.n][e.k === 'gank' ? 2 : 1] : -1;
      const hit = e.k === 'nexus' ? 0 : i === spared ? rand(0.78, 0.92)
        : e.k === 'duel' ? (siege ? rand(0.04, 0.22) : won ? rand(0.12, 0.38) : rand(0.42, 0.72))
          : e.k === 'gank' && !fought ? (casts[A.n][2] === i ? rand(0.32, 0.58) : rand(0.02, 0.18))
            : fought ? (e.kills.length === 1 ? (won ? rand(0.12, 0.5) : rand(0.2, 0.55)) : won ? rand(0.25, 0.68) : rand(0.5, 0.86))
              : OBJECTIVE[e.k] ? (role === 1 ? rand(0.14, 0.34) : rand(0.02, 0.14))
                : siege ? (won ? rand(0.04, 0.18) : rand(0.08, 0.3)) : rand(0, 0.1);
      const left = vit.fight(a.tau + 100, fought ? a.hud : Math.min(a.end, a.tau + SHOW_LEAD + 260), hit, fought);
      stay(a.end, 'f');
      /* le perdant d'un duel de voie rentre à la base ; quiconque sort d'une action presque mort aussi, s'il en a le temps */
      if (A.recall || left < 0.36) {
        const next = appts[i][appts[i].indexOf(A) + 1];
        if (!next || !next.spot || cur.t + 1000 + routeLen(home, next.spot) / VFAST < at[next.n].tau - next.margin) recall();
      }
    }
    aim = state[N];
    routine(total, null, false);
    vit.end(total);
    tracks.push(keys); life.push(vit.hp); mana.push(vit.mp);
  }
  econ.finish();
  /** La part de vie (de 0 à 1) du joueur i à l'instant tau, et celle de sa ressource. */
  const hpAt = (i, x) => valueAt(life[i], x), resAt = (i, x) => valueAt(mana[i], x);

  return { total, at, anchors, casts, tracks, deaths, camps: CAMPS.map((c) => ({ id: c.id, p: c.p, side: c.side, kind: c.kind, hold: c.hold, down: campDown.get(c.id) })), gameAt, tauOfGame, stats, ults, ultReady, levels, levelAt, life, mana, hpAt, resAt, sums, sumLeft,
    /* l'or (gold.js) : goldAt(i, tau) ce qu'il a gagné, pocketAt ce qu'il lui reste, csAt ses sbires, itemsAt ses objets, teamGoldAt(camp, tau),
       buys ses achats [instant, objet, prix], quests l'instant où chacun finit sa quête de rôle, plates les plaques de tourelle tombées */
    goldAt: econ.goldAt, pocketAt: econ.pocketAt, csAt: econ.csAt, itemsAt: econ.itemsAt, teamGoldAt: econ.teamGoldAt, buys: econ.buys, quests: econ.quests, plates: econ.plateLog };
}

/** Où se trouve un joueur à l'instant tau : { x, y, k } (k : ce qu'il fait — w marche, d court, h attend, f combat, c tue un camp, r rentre, g parti, t se téléporte, x mort). */
export function sample(keys, tau, hint = 0) {
  let j = hint;
  if (j >= keys.length || keys[j].t > tau) j = 0;
  while (j + 1 < keys.length && keys[j + 1].t <= tau) j++;
  const a = keys[j], b = keys[j + 1];
  if (!b || b.t <= a.t) return { x: a.x, y: a.y, k: a.k, j };
  const part = clamp((tau - a.t) / (b.t - a.t), 0, 1);
  return { x: a.x + (b.x - a.x) * part, y: a.y + (b.y - a.y) * part, k: a.k, j };
}
