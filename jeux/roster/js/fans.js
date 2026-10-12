/* Les réactions des fans pendant une partie : de courts messages, façon réseaux sociaux, qui commentent de temps en temps les actions
   comme le public d'un vrai match. Tout est inventé ici : ces comptes n'existent pas et personne n'a rien écrit.
   Rien ici ne touche à la page : match.js demande une réaction à chaque événement et l'affiche s'il y en a une. */

const ACCOUNTS = [
  ['Ward Enjoyer', 'ward_enjoyer'], ['Mid ou Feed', 'midoufeed'], ['Le 6e Homme', 'le6ehomme'], ['Jungle Diff', 'jungle_diff_'], ['Coach Canapé', 'coachcanape'],
  ['Baron Volé', 'baronvole'], ['Scaling Enjoyer', 'scaling_enjoyer'], ['Top Gap', 'topgap_'], ['Flash dans le mur', 'flashmur'], ['Pink Ward', 'pinkward_'],
  ['Tilt Proof', 'tiltproof__'], ['Caster du dimanche', 'casterdudimanche'], ['KDA Player', 'kdaplayer_'], ['Gank à 3 minutes', 'gank3min'], ['Héros de SoloQ', 'soloqhero'],
  ['La Botlane', 'labotlane'], ['Mur de fans', 'murdefans'], ['Tchat en feu', 'tchat_en_feu'], ['Split Pusher', 'splitpush_'], ['Fan de la première heure', 'fan_depuis_s3'],
];
const AVATARS = ['#4ea3ff', '#f0586a', '#c8aa6e', '#27d3c4', '#b98cff', '#ffb057', '#8bf07a', '#ff9cc6'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* Les tournures, par genre d'action. k : le tueur (ou la vedette), v : la victime, kc et vc : leurs champions, w et l : l'équipe qui gagne
   l'action et celle qui la perd, j : le jungler de l'équipe qui gagne, n : le nombre d'éliminations. */
const LINES = {
  first: [
    (c) => 'PREMIER SANG pour ' + c.k + ' 🩸 la partie est lancée',
    (c) => c.v + ' qui offre le premier sang… on respire, il reste du temps',
    (c) => c.k + ' n\'a pas attendu longtemps. Premier sang sur ' + c.kc + ' 🔥',
    (c) => 'Le premier sang pour ' + c.w + ', exactement comme sur mon pronostic 😌',
  ],
  solo: [
    (c) => c.k + ' vient d\'éliminer ' + c.v + ' en 1 contre 1. Écart de voie.',
    (c) => 'Le ' + c.kc + ' de ' + c.k + ' c\'est une masterclass, ' + c.v + ' n\'a rien pu faire',
    (c) => 'SOLO KILL 😳 ' + c.k + ' est dans la tête de ' + c.v,
    (c) => c.v + ' voulait juste farmer tranquille. ' + c.k + ' n\'était pas d\'accord.',
  ],
  gank: [
    (c) => c.j + ' habite sur cette voie, il faut lui faire payer un loyer',
    (c) => 'Le gank parfait de ' + c.j + '. ' + c.v + ' n\'avait plus son saut éclair, ça pardonne pas',
    (c) => c.j + ' + ' + c.k + ' = ' + c.v + ' à la fontaine. Simple, efficace.',
  ],
  counter: [
    (c) => 'LE CONTRE-GANK 🤯 ' + c.w + ' avait tout lu',
    (c) => 'Ils attendaient dans le buisson depuis combien de temps ?! Contre-gank de ' + c.w,
  ],
  pick: [
    (c) => c.v + ' tout seul sans vision à ce moment de la partie… ça coûte cher',
    (c) => c.k + ' qui attrape ' + c.v + ' : une balise aurait suffi 👀',
    (c) => 'Élimination gratuite pour ' + c.w + '. Posez des balises svp.',
  ],
  triple: [
    (c) => 'TRIPLÉ pour ' + c.k + ' 🔥🔥🔥',
    (c) => c.k + ' sur ' + c.kc + ' est en train de gagner ce combat tout seul',
    (c) => 'Trois d\'un coup pour ' + c.k + ', quelqu\'un peut l\'arrêter ?',
  ],
  quadra: [
    (c) => 'QUADRUPLÉ ' + c.k + ' !!! Il en manquait UN 😭',
    (c) => c.k + ' vient d\'en prendre quatre. QUATRE. Le ' + c.kc + ' est injouable',
  ],
  penta: [
    (c) => 'PENTAKILL ' + c.k + ' ?!?! JE SUIS DEBOUT DANS MON SALON',
    (c) => 'PENTAAAAAA 🖐️ ' + c.k + ' n\'est pas humain',
    (c) => 'On vient de voir un pentakill de ' + c.k + ' sur ' + c.kc + '. Gardez ce clip pour toujours.',
  ],
  ace: [
    (c) => 'ACE. Rideau. ' + c.w + ' déroule.',
    (c) => 'Cinq à la fontaine côté ' + c.l + ' 💀 quel combat de ' + c.w,
    (c) => 'ACE pour ' + c.w + ' !! Il n\'y a plus personne en face',
  ],
  fightWin: [
    (c) => 'Quel combat de ' + c.w + ' 👏 ' + c.n + ' éliminations, propre',
    (c) => c.k + ' fait toute la différence dans ce combat',
    (c) => c.l + ' a pris ce combat pourquoi exactement ? 🤔',
    (c) => 'L\'engage de ' + c.w + ' était parfait, rien à redire',
  ],
  comeback: [
    (c) => 'ILS REVIENNENT 😱 ' + c.w + ' refuse de perdre cette partie',
    (c) => 'On l\'avait enterrée cette équipe de ' + c.w + '… et la voilà de retour',
    (c) => 'LE RETOUR DE ' + c.w.toUpperCase() + ' !! Je n\'ai plus de voix',
  ],
  steal: [
    (c) => 'LE VOL !!! ' + c.j + ' 😱😱😱',
    (c) => 'Ce Châtiment de ' + c.j + ', j\'en ai renversé mon café',
    (c) => c.j + ' vient de voler l\'objectif sous leur nez. Braquage en bande organisée.',
  ],
  dragon: [
    (c) => 'Encore un dragon pour ' + c.w + ', ça s\'empile tranquillement 🐉',
    (c) => c.l + ' laisse filer les dragons… ça va se payer plus tard',
  ],
  soul: [
    (c) => 'ÂME DU DRAGON pour ' + c.w + ' 🐉 ça sent la fin',
    (c) => 'L\'âme pour ' + c.w + '. ' + c.l + ' doit trouver un combat parfait maintenant',
  ],
  elder: [
    (c) => 'Dragon ancestral pour ' + c.w + '… c\'est plié ?',
    (c) => 'Avec l\'Ancien, ' + c.w + ' va tout faire fondre. Courage ' + c.l + ' 🫡',
  ],
  baron: [
    (c) => 'Nashor pour ' + c.w + ' 👑 les tours vont tomber',
    (c) => c.w + ' prend le Baron, le siège commence',
    (c) => 'Baron ' + c.w + '. ' + c.l + ', il va falloir défendre très proprement',
  ],
  herald: [
    (c) => 'Le Héraut pour ' + c.w + ', la tour n\'a rien vu venir',
  ],
  tower1: [
    (c) => 'Première tour pour ' + c.w + ' 🧱 le plan se déroule',
    (c) => c.w + ' ouvre la carte avec la première tour',
  ],
  inhib: [
    (c) => 'L\'inhibiteur est tombé, la base de ' + c.l + ' est ouverte 😬',
    (c) => 'Super-sbires en route. ' + c.l + ' est dos au mur',
  ],
  nexus: [
    (c) => 'GG ' + c.w + ' ! Quelle partie 👏',
    (c) => c.w + ' l\'emporte. ' + c.l + ', on se retrouve à la prochaine 🫡',
    (c) => 'VICTOIRE ' + c.w.toUpperCase() + ' !!! Je savais (je ne savais pas)',
    (c) => 'Bien joué ' + c.w + '. MVP : ' + c.mvp + ', et de loin',
  ],
  hype: [
    (c) => 'Le ' + c.kc + ' de ' + c.k + ' est un régal à regarder',
    (c) => 'Interdisez ' + c.kc + ' à la prochaine draft svp 🙏',
    (c) => c.k + ' joue cette partie à un autre niveau',
    (c) => 'Petit rappel : ' + c.k + ' est en ' + c.kda + ' sur ' + c.kc,
  ],
};

/** Prépare les réactions d'une partie. P : les dix joueurs ({ name, champName, side }), teams : les deux équipes ({ short }),
    sim : la partie simulée. Renvoie react(ev, n, kda) : la réaction à l'événement n ({ name, handle, color, text, likes, shares }) ou null.
    Pour une même partie, les mêmes réactions tombent aux mêmes moments. */
export function createFans({ P, teams, sim }) {
  const rnd = mulberry32((Math.round(sim.duration) * 2654435761 + sim.events.length * 40503 + 77) >>> 0);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  let lastAt = -9, lastWho = -1, lastLine = null;
  /* un nombre de « j'aime » : la plupart des messages en ont peu, quelques-uns s'envolent */
  const count = (floor, max) => { const v = Math.round(floor + Math.pow(rnd(), 2.2) * max); return v >= 1000 ? (Math.round(v / 100) / 10).toFixed(1).replace('.', ',').replace(',0', '') + ' k' : String(v); };
  return function react(ev, n, kda) {
    /* de quoi parle-t-on ? */
    const fought = ev.kills.length;
    const tally = new Map();
    for (const k of ev.kills) tally.set(k[0], (tally.get(k[0]) || 0) + 1);
    let star = fought ? ev.kills[0][0] : -1, best = 0;
    for (const [i, c] of tally) if (c > best && (ev.s < 0 || (i < 5 ? 0 : 1) === ev.s)) { star = i; best = c; }
    const hl = ev.hl || '', first = /PREMIER SANG/.test(ev.txt), steal = /VOL /.test(ev.txt);
    let kind = null, odds = 0;
    if (ev.k === 'nexus') { kind = 'nexus'; odds = 1; }
    else if (steal) { kind = 'steal'; odds = 1; }
    else if (hl === 'Pentakill') { kind = 'penta'; odds = 1; }
    else if (hl === 'Quadruplé') { kind = 'quadra'; odds = 1; }
    else if (hl === 'Le retour') { kind = 'comeback'; odds = 1; }
    else if (hl === 'Ace') { kind = 'ace'; odds = 0.95; }
    else if (hl === 'Contre-gank') { kind = 'counter'; odds = 0.9; }
    else if (first) { kind = 'first'; odds = 0.9; }
    else if (ev.k === 'elder') { kind = 'elder'; odds = 0.9; }
    else if (ev.k === 'dragon' && (ev.dr[0] >= 4 || ev.dr[1] >= 4)) { kind = 'soul'; odds = 0.9; }
    else if (best >= 3) { kind = 'triple'; odds = 0.8; }
    else if (ev.k === 'baron') { kind = 'baron'; odds = 0.6; }
    else if (ev.k === 'inhib') { kind = 'inhib'; odds = 0.5; }
    else if (ev.k === 'fight' && fought >= 3) { kind = 'fightWin'; odds = 0.45; }
    else if (ev.k === 'gank' && fought) { kind = 'gank'; odds = 0.3; }
    else if (ev.k === 'kill' && hl) { kind = 'solo'; odds = 0.6; }
    else if (ev.k === 'kill') { kind = /isolé|placement|piège|vision/.test(ev.txt) ? 'pick' : 'solo'; odds = 0.22; }
    else if (ev.k === 'tower' && /Première tour/.test(ev.txt)) { kind = 'tower1'; odds = 0.4; }
    else if (ev.k === 'herald') { kind = 'herald'; odds = 0.2; }
    else if (ev.k === 'dragon') { kind = 'dragon'; odds = 0.15; }
    /* de temps en temps, un simple mot d'admiration pour celui qui porte la partie */
    if (!kind && n - lastAt >= 5 && rnd() < 0.1) {
      let top = -1, score = 1.5;
      for (let i = 0; i < 10; i++) { const s = kda[i].k + kda[i].a * 0.4 - kda[i].d * 0.6; if (s > score) { score = s; top = i; } }
      if (top >= 0) { kind = 'hype'; odds = 1; star = top; }
    }
    if (!kind) { rnd(); return null; }
    const roll = rnd();
    /* pas deux réactions de suite, sauf pour ce qui ne se rate pas */
    if (roll >= odds || (n - lastAt < 2 && odds < 0.9)) return null;
    const w = ev.s >= 0 ? ev.s : star >= 0 ? (star < 5 ? 0 : 1) : 0;
    const victim = fought ? ev.kills[ev.kills.length > 1 && best > 1 ? ev.kills.findIndex((k) => k[0] === star) : 0][1] : -1;
    const who = star >= 0 ? star : w * 5 + 1;
    const ctx = {
      k: P[who].name, kc: P[who].champName, v: victim >= 0 ? P[victim].name : teams[1 - w].short, vc: victim >= 0 ? P[victim].champName : '',
      w: teams[w].short, l: teams[1 - w].short, j: P[w * 5 + 1].name, n: ev.kills.filter((k) => (k[0] < 5 ? 0 : 1) === w).length,
      kda: kda[who].k + '/' + kda[who].d + '/' + kda[who].a, mvp: P[sim.mvp].name,
    };
    /* le gank : c'est du jungler qu'on parle ; le contre-gank : de celui qui attendait */
    if (kind === 'gank' && ev.who.length) ctx.j = P[ev.who[0]].name;
    let line = pick(LINES[kind]);
    if (line === lastLine && LINES[kind].length > 1) line = LINES[kind][(LINES[kind].indexOf(line) + 1) % LINES[kind].length];
    let who2 = Math.floor(rnd() * ACCOUNTS.length);
    if (who2 === lastWho) who2 = (who2 + 1) % ACCOUNTS.length;
    lastAt = n; lastWho = who2; lastLine = line;
    const big = odds >= 0.9;
    return { name: ACCOUNTS[who2][0], handle: '@' + ACCOUNTS[who2][1], color: AVATARS[who2 % AVATARS.length], text: line(ctx), likes: count(big ? 1400 : 40, big ? 24000 : 5200), shares: count(big ? 160 : 6, big ? 4200 : 700), kind };
  };
}
