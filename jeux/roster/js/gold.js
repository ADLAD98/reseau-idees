/* L'or de chaque joueur : ce qu'il gagne, les sbires qu'il tue, sa quête de rôle, ce qu'il achète.
   Une vraie retransmission montre l'or de chaque joueur, l'écart poste par poste et les objets achetés.
   - Quand le serveur compte l'or et les sbires de chacun (il les donne alors après chaque action : pg, pc), ce sont ses chiffres qui
     s'affichent : ce module ne fait que les relier d'une action à la suivante — l'or qui coule tout seul (or passif, farm) monte en
     continu, ce que rapporte l'action elle-même tombe au moment où elle se joue — et en tire les achats.
   - Avec un serveur qui ne compte que l'or des deux équipes (les parties d'avant), il reconstitue le tout lui-même.
   Dans les deux cas avec les vraies valeurs du jeu — saison 2026, relevées sur le wiki officiel (wiki.leagueoflegends.com) et dans les
   données de Riot ; rien ici n'est écrit de mémoire :
   - 500 PO au départ, 20,4 PO toutes les 10 secondes à partir de 1:05 ;
   - le farm : chaque joueur tue des sbires au rythme qui est le sien cette saison (ses sbires par minute chez les pros), un peu plus ou un
     peu moins selon son duel de draft et ce qui se passe sur sa voie ; un mort ne farme pas. Un sbire vaut ce que vaut une vague à cette
     heure de la partie (118,7 PO les 6,33 sbires au début, 148 PO les 7 à 25:00) ; un camp de la jungle, 88 PO en moyenne pour 4 sbires ;
   - les éliminations : 300 PO jusqu'au niveau 6 de la victime, +10 par niveau ensuite (420 au niveau 18), +100 pour le premier sang ; les
     assistants se partagent la moitié. La prime d'un joueur grossit de 1 PO par 3 PO gagnés sur des éliminations et de 1 PO par 20 PO de
     farm (au-delà d'une franchise de 100) ; elle fond quand il meurt (1 PO par 3,5 PO distribués), sans descendre sous 50 PO ; une prime
     de mise à mort n'est payée en entier que si l'équipe de la victime mène (le wiki ne chiffre pas ces paliers : ils sont estimés ici) ;
   - les tourelles : cinq plaques de 120 PO chacune, partagées entre ceux qui sont là ; à la chute, 50 PO par joueur (extérieure), 25
     (intérieure, inhibiteur), 50 (Nexus) ; 300 PO de plus pour la première tourelle de la partie ; 50 PO pour un inhibiteur ;
   - les monstres : dragon 75 PO au tueur, Dragon ancestral 150 par joueur, Baron 100 au tueur et 150 par joueur, larve du Néant 30, Héraut 100 ;
   - les quêtes de rôle (depuis la V26.01) : celle du toplaner (1 200 points) lui donne une Téléportation et le niveau 20 ; celle du jungler
     (35 friandises données à son compagnon) 10 PO de plus par camp ; celle du midlaner (1 350 points) des bottes de rang 3 ; celle de
     l'ADC (1 350 points) 300 PO, 2 PO de plus par sbire, 40 par élimination et un emplacement pour ses bottes ; celle du support (800 PO
     gagnés par son objet : 3 puis 5 PO toutes les 10 s, et 18 puis 21 PO par charge, une toutes les 20 s) la forme finale de son objet.
   Les achats : chacun suit le build que les pros prennent sur son champion (items.js), au vrai prix — il achète les composants qu'il peut
   s'offrir à chaque passage à la boutique (départ, retour à la base, réapparition) et les assemble quand il a de quoi.
   Rien ici ne touche à la page : moves.js s'en sert pour décider des retours à la base, match.js pour l'affichage. */
import { BOOTS_UP, ITEMS, JUNGLE_PETS, SUPPORT_ITEM } from './items.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---------- les vraies valeurs ---------- */
export const GOLD = {
  start: 500, passive: 2.04, passiveFrom: 65,
  /* une vague de sbires selon l'heure : [secondes de jeu, or de la vague, nombre de sbires] */
  wave: [[30, 118.66, 6.33], [840, 115, 6.33], [900, 121.5, 6.5], [1500, 148, 7], [1800, 137, 7]],
  /* un camp de la jungle : buffs 90, gromp 80, loups 85, raptors 75, golems 109 — 88 PO en moyenne, compté quatre sbires */
  camp: 88, campCs: 4,
  kill: 300, killPerLevel: 10, killFrom: 6, firstBlood: 100, assist: 0.5, killMin: 50, killMax: 700,
  bountyKill: 1 / 3, bountyFarm: 1 / 20, bountyFarmNeg: 1 / 7, bountyLoss: 1 / 3.5, bountyBuffer: 100,
  plate: 120, plates: 5, tower: [50, 25, 25], nexusTower: 50, firstTower: 300, inhib: 50,
  drake: 75, elder: 150, baronKill: 100, baron: 150, grub: 30, herald: 100,
};
export const QUEST = {
  /* points à réunir, par poste (TOP, JGL, MID, ADC, SUP) */
  need: [1200, 35, 1350, 1350, 800],
  from: 65, perSecond: 1.5, minion: [2, 0, 2, 3, 0], takedown: [15, 0, 25, 15, 0], plate: 40, tower: 50, epic: 30,
  adcGold: 300, adcMinion: 2, adcTakedown: 40, jungleCamp: 10, treatGold: 20,
  atlas: { tick: 0.3, charge: 18, until: 400 }, compass: { tick: 0.5, charge: 21, until: 800 }, bounty: 0.5, final: 0.9, chargeEvery: 20,
};
/* ---------- ce que la mise en scène suppose ---------- */
/* sbires par minute des pros en 2026, par poste : la moyenne de la saison, pour un joueur dont on ne connaît pas la sienne */
const CS_ROLE = [8.44, 6.95, 8.92, 9.89, 1.08];
/* FARM_UP : la moyenne d'un joueur compte ses temps morts ; quand il farme, il va donc un peu plus vite. EDGE : ce qu'un point de duel de
   draft change à son farm. FIRST : l'heure de son premier sbire. USE : la part des charges de son objet qu'un support dépense.
   OUT_OF_LANE : passé la phase de lane, on n'est plus toujours sur sa voie (les points de quête viennent moins vite). */
const FARM_UP = 1.07, EDGE = 0.012, FIRST = [58, 64, 58, 58, 75], USE = 0.8, OUT_OF_LANE = 0.5, STEP = 10, LANING_END = 840;
const LANE_OF = [0, -1, 1, 2, 2], LANE_INDEX = { top: 0, mid: 1, bot: 2 };
const SLOTS = 6;
const [ATLAS, COMPASS, BOUNTY] = SUPPORT_ITEM.steps.map(Number), PETS = new Set(JUNGLE_PETS);
const price = (id) => ITEMS[id][1], parts = (id) => ITEMS[id][2], kindOf = (id) => ITEMS[id][4];

/** Ce que vaut un sbire quand l'horloge marque g secondes. */
export function minionGold(g) {
  const W = GOLD.wave;
  if (g <= W[0][0]) return W[0][1] / W[0][2];
  for (let k = 1; k < W.length; k++) if (g <= W[k][0]) { const a = W[k - 1], b = W[k], p = (g - a[0]) / (b[0] - a[0]); return a[1] / a[2] + (b[1] / b[2] - a[1] / a[2]) * p; }
  return W[W.length - 1][1] / W[W.length - 1][2];
}
const overlap = (list, a, b) => { let s = 0; for (const [x, y] of list) if (y > a && x < b) s += Math.min(b, y) - Math.max(a, x); return s; };
/* la valeur d'une courbe [instant, valeur] à l'instant t (elle est droite entre deux points) */
function valueAt(keys, t) {
  let lo = 0, hi = keys.length - 1;
  if (t >= keys[hi][0]) return keys[hi][1];
  if (t <= keys[0][0]) return keys[0][1];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (keys[m][0] <= t) lo = m; else hi = m; }
  const a = keys[lo], b = keys[hi];
  return b[0] <= a[0] ? b[1] : a[1] + (b[1] - a[1]) * ((t - a[0]) / (b[0] - a[0]));
}

/** L'or de la partie. ev, at, casts, state, deaths, gameAt, tauOfGame, levelAtGame : ce que moves.js sait déjà de la partie (événements,
    leurs instants à l'écran, qui y est, l'état des bâtiments, les morts de chacun, l'horloge). kits : pour chacun des dix joueurs,
    { cspm : ses sbires par minute cette saison, edge : son duel de draft (positif s'il lui est favorable), build : [objet de départ,
    bottes, objets complets…], sup : la forme finale de son objet de support }. */
export function planGold({ ev, at, casts, state, deaths, gameAt, tauOfGame, levelAtGame, kits = [], duration, total, seed = 1, final = null }) {
  const N = ev.length, rnd = mulberry32((seed ^ 0x6f1d5e) >>> 0);
  /* le serveur compte-t-il l'or et les sbires de chacun ? */
  const served = ev.some((e) => e.pg && e.pc);
  const sideOf = (i) => (i < 5 ? 0 : 1);
  const P = [];
  for (let i = 0; i < 10; i++) {
    const kit = kits[i] || {}, role = i % 5;
    P.push({
      i, side: sideOf(i), role,
      rate: (kit.cspm > 0 ? kit.cspm : CS_ROLE[role]) * FARM_UP * (1 + clamp((kit.edge || 0) * EDGE, -0.05, 0.05)) * (0.98 + 0.04 * rnd()),
      gold: GOLD.start, cont: 0, cs: 0, bounty: 0, quest: 0, questAt: Infinity, item: 0, stageAt: [Infinity, Infinity], bank: 0, treats: 0,
      dead: deaths[i].map(([a, b]) => [gameAt(a), gameAt(b)]), freeze: [], boost: [],
      flow: [[0, 0]], csKeys: [[0, 0]], jumps: [], sums: [],
    });
  }
  const teamGold = (s) => { let sum = 0; for (let r = 0; r < 5; r++) sum += P[s * 5 + r].gold; return sum; };
  const aliveAt = (i, g) => !P[i].dead.some(([a, b]) => g >= a && g < b);
  const give = (p, amount, x, why) => { if (!(amount > 0)) return; p.gold += amount; p.jumps.push([x, amount, why]); };
  const split = (list, amount, x, why) => { for (const i of list) give(P[i], amount / list.length, x, why); };
  const plateLog = [];
  let firstBlood = false, firstTower = false, now = 0;

  /* ---------- les quêtes de rôle ---------- */
  function questDone(p, g) {
    p.questAt = g;
    if (p.role === 3) give(p, QUEST.adcGold, tauOfGame(g), 'quest');
  }
  function addQuest(p, pts, g) {
    if (!(pts > 0) || !QUEST.minion[p.role] || p.questAt !== Infinity) return;
    p.quest += pts;
    if (p.quest >= QUEST.need[p.role]) questDone(p, g);
  }

  /* ---------- ce qui coule tout seul : or passif, farm, objet de support, friandises du jungler ---------- */
  function flowTo(g1) {
    while (now < g1 - 1e-9) {
      const g0 = now, g = Math.min(g1, (Math.floor(g0 / STEP + 1e-9) + 1) * STEP), dt = g - g0, mid = (g0 + g) / 2;
      for (const p of P) {
        const alive = dt - overlap(p.dead, g0, g), late = Math.max(0, Math.min(g, QUEST.from) - g0), awake = Math.max(0, alive - late);
        let add = GOLD.passive * Math.max(0, g - Math.max(g0, GOLD.passiveFrom));
        /* le farm : pas avant son premier sbire, pas quand il est mort ni quand il vient de perdre un duel de voie */
        const farmT = clamp(alive - overlap(p.freeze, g0, g) - Math.max(0, Math.min(g, FIRST[p.role]) - g0), 0, dt);
        let dcs = (p.rate * farmT) / 60;
        for (const [a, b, n] of p.boost) if (b > g0 && a < g) dcs += (n * (Math.min(b, g) - Math.max(a, g0))) / (b - a);
        let gv = 0;
        if (p.role === 1) {
          const camps = dcs / GOLD.campCs;
          gv += camps * (GOLD.camp + (g0 >= p.questAt ? QUEST.jungleCamp : 0));
          if (p.questAt === Infinity) {
            /* une friandise par camp ; une de plus, mise de côté chaque minute, que le compagnon mange au camp suivant (20 PO) */
            p.bank += awake / 60;
            const eaten = Math.min(p.bank, camps);
            p.bank -= eaten; p.treats += camps + eaten; add += eaten * QUEST.treatGold;
            if (p.treats >= QUEST.need[1]) p.questAt = g;
          }
        } else gv += dcs * (minionGold(mid) + (p.role === 3 && g0 >= p.questAt ? QUEST.adcMinion : 0));
        p.cs += dcs;
        /* l'objet de support : son or toutes les 10 secondes, et ses charges (une toutes les 20 secondes) tant que sa quête n'est pas finie */
        if (p.role === 4) {
          const st = p.item < QUEST.atlas.until ? QUEST.atlas : p.item < QUEST.compass.until ? QUEST.compass : null;
          if (st) {
            const inc = st.tick * dt + (st.charge * USE * awake) / QUEST.chargeEvery, was = p.item;
            p.item += inc; gv += inc;
            if (was < QUEST.atlas.until && p.item >= QUEST.atlas.until) p.stageAt[0] = g;
            if (p.item >= QUEST.compass.until) { p.stageAt[1] = g; p.questAt = g; }
          } else add += (g0 < p.questAt + 60 ? QUEST.bounty : QUEST.final) * dt;
        }
        add += gv;
        p.bounty += gv * (p.bounty >= 0 ? GOLD.bountyFarm : GOLD.bountyFarmNeg);
        /* la quête des joueurs de voie : des points à chaque seconde passée sur sa voie, à chaque sbire */
        if (QUEST.minion[p.role] && p.questAt === Infinity) {
          p.quest += QUEST.perSecond * awake * (mid < LANING_END ? 1 : OUT_OF_LANE) + QUEST.minion[p.role] * dcs;
          if (p.quest >= QUEST.need[p.role]) questDone(p, g);
        }
        p.cont += add; p.gold += add;
        p.flow.push([g, p.cont]); p.csKeys.push([g, p.cs]);
      }
      now = g;
    }
  }

  /* ---------- les éliminations ---------- */
  /* La part d'une prime de mise à mort qui est payée : entière quand l'équipe de la victime mène nettement, réduite de 30, 60, 90 puis 100 %
     à l'approche de l'égalité (à partir de 6:00). Le wiki ne chiffre pas ces paliers : ici, l'avance en or rapportée à l'or d'une équipe. */
  function paid(side, g) {
    if (g < 360) return 1;
    const a = teamGold(side), b = teamGold(1 - side), lead = (a - b) / ((a + b) / 2);
    return lead >= 0.04 ? 1 : lead >= 0.03 ? 0.7 : lead >= 0.02 ? 0.4 : lead >= 0.01 ? 0.1 : 0;
  }
  function kill([k, v, helpers], g, x) {
    const K = P[k], V = P[v];
    const base = GOLD.kill + GOLD.killPerLevel * clamp(levelAtGame(v, g) - GOLD.killFrom, 0, 12);
    const shut = V.bounty > GOLD.bountyBuffer ? (V.bounty - GOLD.bountyBuffer) * paid(V.side, g) : 0;
    const value = clamp(base + (V.bounty < 0 ? V.bounty : shut), GOLD.killMin, base + GOLD.killMax);
    const pool = helpers.length ? Math.min(value, base) * GOLD.assist : 0;
    give(K, value + (firstBlood ? 0 : GOLD.firstBlood), x, shut >= 150 ? 'shutdown' : 'kill');
    firstBlood = true;
    for (const h of helpers) give(P[h], pool / helpers.length, x, 'assist');
    /* les primes : celle du tueur et de ses assistants grossit, celle de la victime fond (ou disparaît, si c'était une prime de mise à mort) */
    K.bounty += value * GOLD.bountyKill;
    for (const h of helpers) P[h].bounty += (pool / helpers.length) * GOLD.bountyKill;
    V.bounty = V.bounty > GOLD.bountyBuffer ? 0 : Math.max(GOLD.killMin - base, V.bounty - (value + pool) * GOLD.bountyLoss);
    /* quêtes : une élimination ou une assistance compte ; l'ADC qui a fini la sienne touche 40 PO de plus */
    for (const i of [k, ...helpers]) {
      if (P[i].role === 3 && g >= P[i].questAt) give(P[i], QUEST.adcTakedown, x, 'quest');
      addQuest(P[i], QUEST.takedown[P[i].role], g);
    }
  }

  /* ---------- les tourelles ---------- */
  const plates = [0, 1].map(() => [0, 1, 2].map(() => [GOLD.plates, GOLD.plates, GOLD.plates]));
  function plateFall(def, lane, tier, count, list, g, x) {
    count = Math.min(count, plates[def][lane][tier]);
    if (count <= 0 || !list.length) return;
    plates[def][lane][tier] -= count;
    split(list, GOLD.plate * count, x, 'plate');
    for (const i of list) addQuest(P[i], QUEST.plate * count * (LANE_OF[i % 5] === lane ? 1 : 0.5), g);
    plateLog.push([x, def, lane, tier, plates[def][lane][tier]]);
  }
  const lastHit = (list) => { const adc = list.find((i) => i % 5 === 3), mid = list.find((i) => i % 5 === 2); return adc !== undefined ? adc : mid !== undefined ? mid : list[0]; };
  function structures(n, e, x) {
    const before = state[n].lost, after = e.st;
    for (const def of [0, 1]) {
      const att = 1 - def, team = [0, 1, 2, 3, 4].map((r) => att * 5 + r);
      let list = casts[n].filter((i) => sideOf(i) === att);
      if (!list.length) list = team.filter((i) => aliveAt(i, e.t));
      if (!list.length) list = team;
      for (let lane = 0; lane < 3; lane++) for (let k = before[def][lane]; k < after[def][lane]; k++) {
        if (k >= 3) { give(P[lastHit(list)], GOLD.inhib, x, 'inhib'); continue; }
        /* la tourelle tombe : ses plaques restantes à ceux qui sont là, de l'or à toute l'équipe, et la prime de la première tourelle */
        plateFall(def, lane, k, GOLD.plates, list, e.t, x);
        for (const i of team) give(P[i], GOLD.tower[k], x, 'tower');
        if (!firstTower) { firstTower = true; split(list, GOLD.firstTower, x, 'first'); }
        for (const i of list) addQuest(P[i], QUEST.tower * (LANE_OF[i % 5] === lane ? 1 : 0.5), e.t);
      }
      for (let k = before[def][3]; k < after[def][3]; k++) for (const i of team) give(P[i], GOLD.nexusTower, x, 'tower');
    }
  }

  /* ---------- les chiffres du serveur ---------- */
  /* Après chaque action, le serveur donne l'or et les sbires de chacun. Entre deux actions, la courbe de ce module est ramenée dessus :
     ce qui coule tout seul est étiré ou resserré pour tomber juste ; ce que l'action rapporte (élimination, tourelle, objectif…) garde sa
     place à l'écran et prend la valeur qui manque. Ainsi l'affichage est celui du serveur à chaque action, et vraisemblable entre deux. */
  const mark = P.map(() => ({ gold: GOLD.start, cont: 0, flow: 1, jumps: 0, cs: 0, csAt: 1 }));
  function anchor(gold, cs) {
    P.forEach((p, i) => {
      const m = mark[i], want = Math.max(0, gold[i] - m.gold), flowed = p.cont - m.cont;
      const mine = p.jumps.slice(m.jumps), jumped = mine.reduce((sum, j) => sum + j[1], 0);
      /* la part de l'action : celle que ce module lui prêtait, tant qu'elle reste plausible ; le reste revient à ce qui coule */
      let part = jumped > 0 ? clamp(want - flowed, jumped * 0.6, jumped * 1.8) : 0;
      if (part > want) part = want;
      const k = flowed > 1e-6 ? (want - part) / flowed : 0;
      if (flowed <= 1e-6) part = jumped > 0 ? want : 0;
      for (const j of mine) j[1] *= jumped > 0 ? part / jumped : 0;
      for (let q = m.flow; q < p.flow.length; q++) p.flow[q][1] = m.cont + (p.flow[q][1] - m.cont) * k;
      p.cont = m.cont + flowed * k;
      /* (un écart que rien n'explique — pas d'action pour lui, rien qui coule — est posé à l'instant de l'action) */
      const rest = want - part - flowed * k;
      if (rest > 0.5) p.jumps.push([tauOfGame(now), rest, 'other']);
      p.gold = gold[i];
      m.gold = gold[i]; m.cont = p.cont; m.flow = p.flow.length; m.jumps = p.jumps.length;
      /* les sbires : le serveur les donne entiers ; on vise le milieu, pour ne jamais en afficher un de moins */
      const target = cs[i] + 0.5, made = p.cs - m.cs, kc = made > 1e-6 ? Math.max(0, target - m.cs) / made : 0;
      for (let q = m.csAt; q < p.csKeys.length; q++) p.csKeys[q][1] = m.cs + (p.csKeys[q][1] - m.cs) * kc;
      if (made <= 1e-6 && target > m.cs) p.csKeys.push([now, target]);
      p.cs = Math.max(m.cs, target);
      m.cs = p.cs; m.csAt = p.csKeys.length;
    });
  }

  /* ---------- la partie, événement après événement ---------- */
  const farmer = (i) => (i % 5 === 4 ? i - 1 : i);
  for (let n = 0; n < N; n++) {
    const e = ev[n], a = at[n], here = casts[n] || [];
    flowTo(e.t);
    e.kills.forEach((k, j) => kill(k, e.t, a.kills[j]));
    if (e.st) structures(n, e, a.hud);
    if (e.s >= 0) {
      const mine = here.filter((i) => sideOf(i) === e.s), team = [0, 1, 2, 3, 4].map((r) => e.s * 5 + r);
      const taker = mine.includes(e.s * 5 + 1) ? e.s * 5 + 1 : mine.length ? mine[0] : e.s * 5 + 1;
      let epic = 0;
      if (e.k === 'dragon') { give(P[taker], GOLD.drake, a.hud, 'drake'); epic = 1; }
      else if (e.k === 'elder') { for (const i of team) give(P[i], GOLD.elder, a.hud, 'elder'); epic = 1; }
      else if (e.k === 'baron') { give(P[taker], GOLD.baronKill, a.hud, 'baron'); for (const i of team) give(P[i], GOLD.baron, a.hud, 'baron'); epic = 1; }
      else if (e.k === 'herald') { split(mine.length ? mine : [taker], GOLD.herald, a.hud, 'herald'); epic = 1; }
      else if (e.k === 'grubs') {
        /* trois larves ; quand l'autre jungler est là, il en sauve une */
        const foes = here.filter((i) => sideOf(i) !== e.s);
        epic = foes.length ? 2 : 3;
        split(mine.length ? mine : [taker], GOLD.grub * epic, a.hud, 'grubs');
        if (foes.length) split(foes, GOLD.grub, a.hud, 'grubs');
      }
      if (epic) for (const i of mine) addQuest(P[i], QUEST.epic * epic, e.t);
      /* sur une voie, pendant la phase de lane : celui qui prend le dessus creuse l'écart au farm, ou entame la tourelle d'en face */
      const lane = LANE_INDEX[e.z];
      if (lane !== undefined && e.t <= LANING_END + 60 && state[n].lost[1 - e.s][lane] === 0) {
        const def = 1 - e.s, duo = (lane === 2 ? [3, 4] : lane === 1 ? [2] : [0]).map((r) => e.s * 5 + r).filter((i) => aliveAt(i, e.t + 1));
        if (e.k === 'duel') {
          const w = here.find((i) => sideOf(i) === e.s), l = here.find((i) => sideOf(i) !== e.s);
          const said = /(\d+) sbires d'avance/.exec(e.txt || ''), plate = /plaques/.test(e.txt || '');
          const count = said ? Number(said[1]) : plate ? 4 : 8;
          /* (les sbires d'avance, le serveur qui compte l'or les a déjà donnés) */
          if (w !== undefined && !served) P[farmer(w)].boost.push([e.t, e.t + 60, count]);
          if (l !== undefined) P[farmer(l)].freeze.push([e.t, e.t + 24]);
          if (plate && plates[def][lane][0] > 1) plateFall(def, lane, 0, 1, duo, e.t, a.hud);
        } else if (e.kills.length && plates[def][lane][0] > 1 && rnd() < 0.5) plateFall(def, lane, 0, 1, duo.length ? duo : mine, e.t, a.hud);
      }
    }
    if (served && e.pg && e.pc) anchor(e.pg, e.pc);
  }
  flowTo(Math.max(duration, now));
  /* la fin de la partie : les totaux du serveur */
  if (served && final && final.length === 10 && final.every((f) => f && f.g > 0)) anchor(final.map((f) => f.g), final.map((f) => f.cs || 0));
  for (const p of P) {
    p.jumps.sort((a, b) => a[0] - b[0]);
    let s = 0;
    p.sums = p.jumps.map((j) => (s += j[1]));
  }
  const jumped = (p, x) => {
    const J = p.jumps;
    if (!J.length || x < J[0][0]) return 0;
    let lo = 0, hi = J.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (J[m][0] <= x) lo = m; else hi = m - 1; }
    return p.sums[lo];
  };
  /** L'or gagné par le joueur i depuis le début, à l'instant x de la mise en scène. */
  const goldAt = (i, x) => GOLD.start + valueAt(P[i].flow, gameAt(x)) + jumped(P[i], x);
  /** Les sbires qu'il a tués. */
  const csAt = (i, x) => Math.floor(valueAt(P[i].csKeys, gameAt(x)) + 1e-6);
  const teamGoldAt = (s, x) => { let sum = 0; for (let r = 0; r < 5; r++) sum += goldAt(s * 5 + r, x); return sum; };

  /* ---------- les achats ---------- */
  /** Ce qu'il en coûte d'obtenir l'objet « id » avec ce sac : son prix, moins ce que valent ceux de ses composants qu'on a déjà
      (ils sont retirés du sac ; used : ceux qui serviront). */
  function quote(id, bag) {
    let cost = price(id);
    const used = [];
    for (const c of parts(id)) {
      const k = bag.indexOf(c);
      if (k >= 0) { bag.splice(k, 1); used.push(c); cost -= price(c); }
      else if (ITEMS[c]) { const q = quote(c, bag); used.push(...q.used); cost -= price(c) - q.cost; }
    }
    return { cost, used };
  }
  /* les composants (de tous étages) qu'il manque pour faire l'objet « id » */
  function missing(id, bag, out) {
    for (const c of parts(id)) {
      const k = bag.indexOf(c);
      if (k >= 0) bag.splice(k, 1);
      else if (ITEMS[c]) { out.push(c); missing(c, bag, out); }
    }
    return out;
  }
  const S = P.map((p, i) => {
    const kit = kits[i] || {}, b = (kit.build || []).map(Number);
    return { inv: [], spent: 0, visits: 0, last: -Infinity, start: ITEMS[b[0]] ? b[0] : 0, boots: ITEMS[b[1]] ? b[1] : 0, core: b.slice(2).filter((id) => ITEMS[id]),
      final: ITEMS[Number(kit.sup)] ? Number(kit.sup) : 0, shelf: [[0, []]], ledger: [[0, 0]], buys: [], auto: 0 };
  });
  const ORDER = { f: 0, b: 1, c: 2, s: 3 };
  /* l'inventaire, rangé pour l'affichage : objets complets, bottes, composants (les plus chers d'abord), objet de départ */
  const tidy = (inv) => inv.map((id, k) => [id, k]).sort((a, b) => ORDER[kindOf(a[0])] - ORDER[kindOf(b[0])] || (kindOf(a[0]) === 'c' ? price(b[0]) - price(a[0]) : 0) || a[1] - b[1]).map((q) => q[0]);
  const snap = (s, x) => { s.shelf.push([x, tidy(s.inv)]); };
  const hasBoots = (s) => s.inv.some((id) => kindOf(id) === 'b' && id !== 1001);
  /* ce qu'il vise : son premier objet, ses bottes, puis la suite de son build */
  function target(s) {
    const order = s.core.length ? [s.core[0], s.boots, ...s.core.slice(1)] : [s.boots];
    for (const id of order) {
      if (!id) continue;
      if (id === s.boots) { if (!hasBoots(s)) return id; continue; }
      if (!s.inv.includes(id)) return id;
    }
    return 0;
  }
  /* les transformations qui ne passent pas par la boutique : l'Atlas du support grandit avec sa quête, le compagnon du jungler se fond dans
     son Châtiment, les bottes du midlaner passent au rang 3 */
  const autos = P.map((p) => {
    const list = [];
    if (p.role === 4) list.push([p.stageAt[0], ATLAS, COMPASS], [p.stageAt[1], COMPASS, BOUNTY]);
    if (p.role === 1) list.push([p.questAt, 'pet']);
    if (p.role === 2) list.push([p.questAt, 'boots']);
    return list.filter((a) => a[0] < Infinity).sort((a, b) => a[0] - b[0]);
  });
  function sync(i, x) {
    const s = S[i];
    while (s.auto < autos[i].length && tauOfGame(autos[i][s.auto][0]) <= x) {
      const [g, a, b] = autos[i][s.auto++];
      const k = a === 'pet' ? s.inv.findIndex((id) => PETS.has(id)) : a === 'boots' ? s.inv.findIndex((id) => BOOTS_UP[id]) : s.inv.indexOf(a);
      if (k < 0) continue;
      if (a === 'pet') s.inv.splice(k, 1); else s.inv[k] = a === 'boots' ? Number(BOOTS_UP[s.inv[k]]) : b;
      snap(s, tauOfGame(g));
    }
  }
  /* (les bottes de l'ADC qui a fini sa quête ont leur propre emplacement : elles ne comptent plus dans les six) */
  const load = (i, list, g) => list.filter((id) => !(P[i].role === 3 && g >= P[i].questAt && kindOf(id) === 'b')).length;
  /* fait de la place s'il le faut, en revendant l'objet de départ ; faux si l'achat ne tient pas dans l'inventaire */
  function room(i, id, g, x) {
    const s = S[i], q = quote(id, s.inv.slice());
    const after = () => load(i, s.inv, g) - load(i, q.used, g) + load(i, [id], g);
    if (after() <= SLOTS) return true;
    const k = s.inv.findIndex((it) => ITEMS[it][5] !== undefined && !q.used.includes(it));
    if (k < 0) return false;
    s.spent -= ITEMS[s.inv[k]][5];
    s.buys.push([x, -s.inv[k], 0]);
    s.inv.splice(k, 1);
    return after() <= SLOTS;
  }
  function take(i, id, x, g) {
    const s = S[i], q = quote(id, s.inv.slice());
    for (const c of q.used) s.inv.splice(s.inv.indexOf(c), 1);
    /* le midlaner qui a fini sa quête : ses bottes de rang 2 passent aussitôt au rang 3 */
    s.inv.push(P[i].role === 2 && g >= P[i].questAt && BOOTS_UP[id] ? Number(BOOTS_UP[id]) : id);
    s.spent += q.cost;
    s.buys.push([x, id, q.cost]);
  }
  /** Le joueur i est à la boutique à l'instant x : il achète ce qu'il peut. */
  function shop(i, x) {
    const s = S[i], p = P[i], g = gameAt(x);
    sync(i, x);
    s.visits++; s.last = g;
    const pocket = () => goldAt(i, x) - s.spent;
    if (s.visits === 1) {
      if (s.start) { s.inv.push(s.start); s.buys.push([x, s.start, price(s.start)]); }
      /* le reste des 500 PO part en potions */
      s.spent = GOLD.start;
      s.ledger.push([x, s.spent]);
      snap(s, x);
      return;
    }
    /* la forme finale de l'objet de support : gratuite, une fois la quête finie */
    const bw = s.inv.indexOf(BOUNTY);
    if (bw >= 0 && s.final) { s.inv[bw] = s.final; s.buys.push([x, s.final, 0]); }
    for (let guard = 0; guard < 14; guard++) {
      const t = target(s);
      if (!t) break;
      let pick = 0;
      if (quote(t, s.inv.slice()).cost <= pocket()) pick = t;
      else {
        /* pas de quoi le finir : le composant le plus cher qu'il peut s'offrir */
        let best = -1;
        for (const c of new Set(missing(t, s.inv.slice(), []))) {
          const cost = quote(c, s.inv.slice()).cost;
          if (cost <= pocket() && price(c) > best) { best = price(c); pick = c; }
        }
      }
      if (!pick || !room(i, pick, g, x)) break;
      take(i, pick, x, g);
    }
    /* avec la monnaie : une paire de bottes simples, s'il n'en a pas encore */
    if (s.boots && !s.inv.some((id) => kindOf(id) === 'b') && pocket() >= price(1001) + 60 && room(i, 1001, g, x)) take(i, 1001, x, g);
    /* et des balises de contrôle (75 PO ; 40 pour le support qui a fini sa quête) : deux pour un support, une pour un jungler, une de temps en temps pour les autres */
    const ward = p.role === 4 && g >= p.questAt ? 40 : 75;
    for (let k = p.role === 4 ? 2 : p.role === 1 || rnd() < 0.35 ? 1 : 0; k > 0 && pocket() >= ward; k--) s.spent += ward;
    s.ledger.push([x, s.spent]);
    snap(s, x);
  }
  /* la dernière ligne d'un registre [instant, valeur] à l'instant x */
  const lastAt = (list, x) => {
    let lo = 0, hi = list.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (list[m][0] <= x) lo = m; else hi = m - 1; }
    return list[lo][1];
  };
  /** A-t-il de quoi faire un achat qui vaille un retour à la base ? */
  function wants(i, x) {
    const s = S[i], g = gameAt(x);
    if (!s.visits || g < 150 || g - s.last < 150) return false;
    const t = target(s);
    if (!t) return false;
    const pocket = goldAt(i, x) - s.spent, whole = quote(t, s.inv.slice()).cost;
    if (whole <= pocket) return true;
    if (whole <= 1500) return false;
    let big = 0;
    for (const c of new Set(missing(t, s.inv.slice(), []))) big = Math.max(big, quote(c, s.inv.slice()).cost);
    return pocket >= clamp(big, 1100, 1300);
  }
  /** À la fin : les dernières transformations. */
  function finish() { for (let i = 0; i < 10; i++) sync(i, total); }
  /** L'inventaire du joueur i à l'instant x (numéros d'objets, rangés pour l'affichage). */
  const itemsAt = (i, x) => lastAt(S[i].shelf, x);

  return {
    goldAt, csAt, teamGoldAt, shop, wants, finish, itemsAt, plateLog,
    /** L'or qu'il n'a pas encore dépensé. */
    pocketAt: (i, x) => goldAt(i, x) - lastAt(S[i].ledger, x),
    /** Ses achats : [instant, numéro de l'objet (négatif : revendu), prix payé]. */
    buys: S.map((s) => s.buys),
    /** L'instant où chacun finit sa quête de rôle (Infinity : jamais). */
    quests: P.map((p) => (p.questAt < Infinity ? tauOfGame(p.questAt) : Infinity)),
    players: P, shops: S,
  };
}
