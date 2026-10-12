/* Le match : présentation des deux équipes, partie rejouée sur la carte avec commentaires et ralentis, puis résultat.
   Le serveur a déjà joué toute la partie ; il envoie la suite des événements et cet écran les met en scène. */
import { cardHTML, esc, iconUrl } from './cards.js';
import { DDRAGON, ROLE_LABEL, STORE } from './config.js';
import { createFx } from './fx.js';
import { ROLES, signed } from './rules.js';
import { setSound, sfx, soundOn } from './sound.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const clockText = (sec) => Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');
const kilo = (g) => (Math.round(g / 100) / 10).toFixed(1).replace('.', ',') + 'k';
const icon = (id) => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + id + '"/></svg>';
const SIDE_COLORS = [['#4ea3ff', '#bfe0ff', '#ffffff'], ['#f0586a', '#ffc2c9', '#ffffff']];
const GOLD = ['#f0e6d2', '#c8aa6e', '#ffe7a8', '#ffffff'];
const STREAK = ['', '', 'Doublé', 'Triplé', 'Quadruplé', 'Pentakill'];

/* ---------- la carte : un carré de 1000 de côté, base bleue en bas à gauche, base rouge en haut à droite ---------- */
const mirror = (p) => [1000 - p[0], 1000 - p[1]];
/* bâtiments bleus de chaque voie (haut, milieu, bas) : tour extérieure, intérieure, d'inhibiteur, puis l'inhibiteur */
const BLUE = [
  [[92, 300], [92, 530], [92, 690], [92, 768]],
  [[415, 585], [335, 665], [262, 738], [218, 782]],
  [[700, 908], [470, 908], [310, 908], [232, 908]],
];
/* la carte est symétrique : la voie du haut des rouges est le reflet de la voie du bas des bleus */
const STRUCT = [BLUE, [BLUE[2].map(mirror), BLUE[1].map(mirror), BLUE[0].map(mirror)]];
const NEXUS_TOWERS = [[[126, 840], [160, 874]], [[874, 160], [840, 126]]];
const NEXUS = [[96, 904], [904, 96]];
const FOUNTAIN = [[50, 950], [950, 50]];
const PIT = { drake: [650, 708], baron: [350, 292] };
const ZONE = { top: [128, 128], mid: [500, 500], bot: [872, 872], drake: PIT.drake, baron: PIT.baron, base0: [170, 830], base1: [830, 170] };
/* phase de lane : place de chaque joueur, [bleu, rouge], pour TOP, JGL, MID, ADC, SUP */
const LANE_HOME = [
  [[95, 226], [226, 95]],
  [[290, 570], [710, 430]],
  [[462, 538], [538, 462]],
  [[734, 906], [906, 734]],
  [[826, 878], [878, 826]],
];
/* après la phase de lane, le gros de l'équipe bleue tient le milieu, là où en sont les tours (shift : avancée vers la base rouge) */
function bluePost(role, t, shift) {
  const a0 = shift - 72;
  const ab = role === 2 ? [a0, 0] : role === 1 ? [a0 - 22, -86] : role === 4 ? [a0 - 12, 82] : role === 3 ? [a0 - 78, 32] : t > 1500 ? [a0 - 74, -46] : null;
  if (!ab) return [95, 330];
  return [500 + 0.707 * (ab[0] + ab[1]), 500 + 0.707 * (ab[1] - ab[0])];
}
function homeOf(i, t, lost) {
  const side = i < 5 ? 0 : 1, role = i % 5;
  if (t < 840) return LANE_HOME[role][side];
  const shift = clamp(lost[1][1] - lost[0][1], -2, 2) * 52;
  if (side === 0) return bluePost(role, t, shift);
  /* les toplaners se font face sur la même voie tant que les équipes ne se regroupent pas */
  return role === 0 && t <= 1500 ? [330, 95] : mirror(bluePost(role, t, -shift));
}

function mapSVG() {
  const lanes = ['M92 868V162Q92 92 162 92H868', 'M152 848 848 152', 'M132 908H838Q908 908 908 838V132'];
  const diamond = (p, r) => 'M' + p[0] + ' ' + (p[1] - r) + 'L' + (p[0] + r) + ' ' + p[1] + 'L' + p[0] + ' ' + (p[1] + r) + 'L' + (p[0] - r) + ' ' + p[1] + 'Z';
  const pit = (name, sym) => '<g class="m-pit" data-pit="' + name + '"><circle cx="' + PIT[name][0] + '" cy="' + PIT[name][1] + '" r="40"/>'
    + '<use href="#' + sym + '" x="' + (PIT[name][0] - 21) + '" y="' + (PIT[name][1] - 21) + '" width="42" height="42"/></g>';
  let s = '<svg class="mv-svg" viewBox="0 0 1000 1000" aria-hidden="true"><defs>'
    + '<radialGradient id="mvBase0" cx="0" cy="1" r="1"><stop offset="0" stop-color="#4ea3ff" stop-opacity=".42"/><stop offset="1" stop-color="#4ea3ff" stop-opacity="0"/></radialGradient>'
    + '<radialGradient id="mvBase1" cx="1" cy="0" r="1"><stop offset="0" stop-color="#f0586a" stop-opacity=".42"/><stop offset="1" stop-color="#f0586a" stop-opacity="0"/></radialGradient>'
    + '<pattern id="mvHatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.5" height="16" fill="#c8aa6e" fill-opacity=".055"/></pattern></defs>'
    + '<rect class="m-ground" width="1000" height="1000"/><rect width="1000" height="1000" fill="url(#mvHatch)"/>'
    + '<rect x="0" y="640" width="360" height="360" fill="url(#mvBase0)"/><rect x="640" y="0" width="360" height="360" fill="url(#mvBase1)"/>'
    + '<path class="m-river" d="M168 212C300 310 430 430 500 500S700 690 832 788"/><path class="m-river-line" d="M168 212C300 310 430 430 500 500S700 690 832 788"/>'
    + lanes.map((d) => '<path class="m-lane" d="' + d + '"/>').join('') + lanes.map((d) => '<path class="m-lane-line" d="' + d + '"/>').join('')
    /* les bases, et les quatre camps de la jungle qui donnent un bonus (bleu, rouge) */
    + '<path class="m-base s0" d="M0 700A300 300 0 0 1 300 1000"/><path class="m-base s1" d="M700 0A300 300 0 0 0 1000 300"/>'
    + [[255, 462, 'b'], [540, 742, 'r'], [745, 538, 'b'], [460, 258, 'r']].map((c) => '<path class="m-camp ' + c[2] + '" d="' + diamond(c, 13) + '"/>').join('')
    + pit('baron', 'i-baron') + pit('drake', 'i-drake');
  for (const side of [0, 1]) {
    STRUCT[side].forEach((lane, l) => lane.forEach((p, k) => {
      s += k < 3 ? '<path class="m-tw s' + side + '" data-b="' + side + l + k + '" d="' + diamond(p, 16) + '"/>'
        : '<circle class="m-inh s' + side + '" data-b="' + side + l + k + '" cx="' + p[0] + '" cy="' + p[1] + '" r="10"/>';
    }));
    NEXUS_TOWERS[side].forEach((p, k) => { s += '<path class="m-tw s' + side + '" data-b="n' + side + k + '" d="' + diamond(p, 14) + '"/>'; });
    s += '<path class="m-nexus s' + side + '" data-b="x' + side + '" d="' + diamond(NEXUS[side], 30) + '"/>';
  }
  return s + '</svg>';
}

/** Montre un match. data : { match, report, sim, rewards } tel que le serveur l'envoie. Renvoie { goTo } quand le joueur referme l'écran. */
export function runMatch({ data, cat, fx }) {
  const M = data.match, sim = data.sim, events = sim.events, you = M.you, rewards = data.rewards || {};
  /* les dix joueurs : 0 à 4 pour les bleus (TOP, JGL, MID, ADC, SUP), 5 à 9 pour les rouges */
  const P = [];
  for (const side of [0, 1]) {
    M.teams[side].players.forEach((p, r) => {
      const champ = M.picks[side][r];
      P.push({ side, role: ROLES[r], name: p.name || 'Remplaçant', card: (p.id && cat.cardById.get(p.id)) || null, champ, champName: cat.champions[champ] ? cat.champions[champ].n : champ });
    });
  }
  const short = (s) => M.teams[s].short;
  const foeTeam = cat.teamById.get(M.opp);

  /* ---------- l'écran ---------- */
  const strip = (i) => {
    const p = P[i], rep = data.report.picks[p.side][i % 5];
    return '<div class="vs-strip" style="--art:url(' + DDRAGON + '/img/champion/loading/' + p.champ + '_0.jpg)">'
      + '<span class="vs-role">' + ROLE_LABEL[p.role] + '</span><span class="vs-val ' + (rep.total >= 0 ? 'up' : 'down') + '" title="Bilan de draft">' + signed(rep.total) + '</span>'
      + '<span class="vs-name"><b>' + esc(p.name) + '</b><i>' + esc(p.champName) + '</i></span></div>';
  };
  const draftSum = (s) => data.report.picks[s].reduce((sum, p) => sum + p.total, 0);
  const vsTeam = (s) => '<div class="vs-team s' + s + '"><div class="vs-head"><b>' + esc(M.teams[s].name) + '</b><span>' + M.teams[s].rating + '</span>'
    + '<i>' + (s === you ? 'Toi · ' : '') + (s === 0 ? 'côté bleu' : 'côté rouge') + ' · draft ' + signed(draftSum(s)) + '</i></div>'
    + '<div class="vs-strips">' + [0, 1, 2, 3, 4].map((r) => strip(s * 5 + r)).join('') + '</div></div>';
  const stat = (sym, key, value) => '<span class="mv-s">' + icon(sym) + '<b data-h="' + key + '">' + value + '</b></span>';
  const hudTeam = (s) => '<div class="mv-t s' + s + '"><span class="mv-tn">' + esc(short(s)) + (s === you ? '<em>toi</em>' : '') + '</span><b data-h="k' + s + '">0</b></div>';
  const hudObj = (s) => '<div class="mv-o s' + s + '">' + stat('i-coin', 'g' + s, '2,5k') + stat('i-tower', 'tw' + s, '0')
    + '<span class="mv-s">' + icon('i-drake') + '<span class="mv-dr" data-dr="' + s + '"><i></i><i></i><i></i><i></i></span></span>' + stat('i-baron', 'bn' + s, '0') + '</div>';
  const sideHTML = (s) => '<aside class="mv-side s' + s + '">' + [0, 1, 2, 3, 4].map((r) => {
    const i = s * 5 + r, p = P[i];
    return '<div class="mv-p" data-p="' + i + '"><span class="mv-pi"><img src="' + iconUrl(cat, p.champ) + '" alt="" draggable="false"></span>'
      + '<span class="mv-pn"><b>' + esc(p.name) + '</b><i>' + ROLE_LABEL[p.role] + ' · ' + esc(p.champName) + '</i></span><span class="mv-pk" data-kda="' + i + '">0/0/0</span></div>';
  }).join('') + '</aside>';

  const root = document.createElement('div');
  root.className = 'mv';
  root.dataset.stage = 'versus';
  root.innerHTML = '<canvas class="mv-fx"></canvas><div class="mv-flash"></div>'
    + '<section class="vs">' + vsTeam(0) + '<div class="vs-mid"><i></i><b>VS</b><i></i></div>' + vsTeam(1)
    + '<div class="vs-foot"><button class="btn primary big" type="button" data-act="start">' + (fx ? 'Lancer la partie' : 'Voir le résultat') + '</button></div></section>'
    + '<section class="mv-game"><header class="mv-hud">' + hudTeam(0) + '<div class="mv-clock"><b data-h="clock">0:00</b><span data-h="lead">égalité</span></div>' + hudTeam(1)
    + hudObj(0) + '<div class="mv-gold"><i data-h="bar"></i></div>' + hudObj(1) + '</header>'
    + '<div class="mv-mid">' + sideHTML(0)
    + '<div class="mv-map"><div class="mv-map-in">' + mapSVG() + '<svg class="mv-beams" viewBox="0 0 1000 1000" aria-hidden="true"></svg></div>'
    + '<div class="mv-replay"><div class="mv-replay-top"><span>Ralenti</span><b></b></div><div class="mv-replay-foot"></div></div></div>'
    + sideHTML(1) + '</div>'
    + '<div class="mv-cast" aria-live="polite"></div>'
    + '<footer class="mv-ctrl"><button class="op-icon" type="button" data-act="pause" aria-label="Pause ou reprise"></button>'
    + '<div class="mv-speed" role="group" aria-label="Vitesse">' + [1, 2, 4].map((v) => '<button type="button" data-speed="' + v + '">×' + v + '</button>').join('') + '</div>'
    + '<span class="spacer"></span><button class="op-icon" type="button" data-act="sound" aria-label="Couper ou remettre le son"></button>'
    + '<button class="btn" type="button" data-act="skip">Passer</button></footer></section>'
    + '<section class="mv-end"></section>';
  const $ = (sel) => root.querySelector(sel);
  const mapEl = $('.mv-map'), mapIn = $('.mv-map-in'), beams = $('.mv-beams'), cast = $('.mv-cast'), banner = $('.mv-replay'), endEl = $('.mv-end');
  const H = {};
  root.querySelectorAll('[data-h]').forEach((n) => { H[n.dataset.h] = n; });
  const built = new Map(Array.from(root.querySelectorAll('[data-b]'), (n) => [n.dataset.b, n]));
  const rows = P.map((p, i) => root.querySelector('.mv-p[data-p="' + i + '"]'));
  const kdaEls = P.map((p, i) => root.querySelector('[data-kda="' + i + '"]'));
  const tokens = P.map((p) => {
    const d = document.createElement('div');
    d.className = 'tk s' + p.side;
    d.innerHTML = '<img src="' + iconUrl(cat, p.champ) + '" alt="" draggable="false">';
    mapIn.appendChild(d);
    return d;
  });
  const scroll = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(root);
  const particles = createFx($('.mv-fx'));

  /* ---------- état de la partie affichée ---------- */
  let speed = 1, paused = false, skipped = false, skipSlow = false, closed = false, playing = false, run = 0, done = null;
  try { speed = Number(localStorage.getItem(STORE + 'vitesse')) || 1; } catch (e) { speed = 1; }
  if (![1, 2, 4].includes(speed)) speed = 1;
  let clockT = 0, lost = [[0, 0, 0, 0], [0, 0, 0, 0]];
  const pos = P.map(() => [500, 500]), kda = P.map(() => ({ k: 0, d: 0, a: 0 })), deadUntil = P.map(() => 0), score = [0, 0];
  const stage = (name) => { root.dataset.stage = name; };
  const pop = (node) => { node.classList.remove('pop'); void node.offsetWidth; node.classList.add('pop'); };
  const set = (key, value) => { const n = H[key], v = String(value); if (n.textContent !== v) { n.textContent = v; pop(n); } };

  /** Attend « ms » à vitesse 1 : moins longtemps si la vitesse est poussée, suspendu pendant une pause.
      tick(part) est appelé à chaque image avec la part du temps écoulée (0 à 1). */
  function nap(ms, tick, cap) {
    const mine = run;
    return new Promise((resolve) => {
      let left = ms, last = performance.now();
      const step = (now) => {
        if (closed || skipped || mine !== run || (cap && skipSlow)) return resolve();
        /* l'heure d'une image peut précéder de peu celle du départ : jamais de temps négatif */
        const dt = Math.max(0, Math.min(100, now - last));
        last = now;
        if (!paused) left -= dt * (cap ? Math.min(speed, cap) : speed);
        if (tick) tick(1 - Math.max(0, left) / ms);
        if (left <= 0) resolve(); else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  const stopped = (mine) => closed || skipped || mine !== run;

  /* ---------- pions ---------- */
  function moveTo(i, x, y) {
    pos[i] = [clamp(x, 40, 960), clamp(y, 40, 960)];
    tokens[i].style.left = pos[i][0] / 10 + '%';
    tokens[i].style.top = pos[i][1] / 10 + '%';
  }
  function setDead(i, dead) {
    tokens[i].classList.toggle('dead', dead);
    if (!dead) tokens[i].classList.remove('away');
    rows[i].classList.toggle('dead', dead);
  }
  function goHome(i, jitter) {
    if (deadUntil[i] && deadUntil[i] > clockT) { const f = FOUNTAIN[i < 5 ? 0 : 1]; tokens[i].classList.add('away'); moveTo(i, f[0] + (i % 5 - 2) * 9, f[1] + (i % 5 - 2) * 9); return; }
    const h = homeOf(i, clockT, lost), j = jitter ? 8 : 0;
    moveTo(i, h[0] + (Math.random() * 2 - 1) * j, h[1] + (Math.random() * 2 - 1) * j);
  }
  /* les morts reviennent à la vie quand leur délai est écoulé ; les autres bougent un peu, pour que la carte vive */
  function idle() {
    P.forEach((p, i) => {
      if (deadUntil[i] && deadUntil[i] <= clockT) { deadUntil[i] = 0; setDead(i, false); }
      goHome(i, fx);
    });
  }
  /** Où se passe un événement. */
  function anchor(ev, n) {
    const z = ev.z;
    if (ZONE[z]) return ZONE[z];
    if (z === 'river') return n % 2 ? [588, 592] : [412, 408];
    if (z === 'jg0') return n % 2 ? [300, 520] : [540, 745];
    if (z === 'jg1') return n % 2 ? [700, 480] : [460, 255];
    if (z.slice(0, 2) === 'tw') {
      const def = Number(z[2]), lane = Number(z[3]);
      /* le bâtiment qui vient de tomber, ou celui qui est attaqué */
      const k = ev.st ? ev.st[def][lane] - 1 : lost[def][lane];
      return STRUCT[def][lane][clamp(k, 0, 3)];
    }
    return [500, 500];
  }
  /** Les joueurs présents. Pour une tour, le serveur ne les cite pas : on envoie ceux qui tiennent la voie. */
  function castOf(ev) {
    if (ev.who.length || ev.z.slice(0, 2) !== 'tw') return ev.who;
    const def = Number(ev.z[2]), lane = Number(ev.z[3]), att = 1 - def;
    const roles = clockT > 1500 ? [0, 1, 2, 3, 4] : lane === 0 ? [0, 1] : lane === 1 ? [2, 3, 4] : [3, 4];
    const list = roles.map((r) => att * 5 + r);
    /* un siège repoussé : les défenseurs sont là aussi */
    if (ev.k === 'duel') list.push(def * 5 + 2, def * 5 + (lane === 0 ? 0 : 3));
    return list.filter((i) => !(deadUntil[i] > clockT));
  }
  /** Range les joueurs présents de part et d'autre du point d'action : les bleus côté base bleue, les rouges en face. */
  function place(who, a) {
    for (const side of [0, 1]) {
      const group = who.filter((i) => (i < 5 ? 0 : 1) === side), sgn = side === 0 ? -1 : 1;
      group.forEach((i, k) => {
        const across = (k - (group.length - 1) / 2) * 64, along = sgn * (group.length > 3 ? 46 + (k % 2) * 36 : 46);
        moveTo(i, a[0] + 0.707 * (along + across), a[1] + 0.707 * (across - along));
      });
    }
  }
  const clientOf = (node) => { const r = node.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  function ping(a, side) {
    const p = document.createElement('i');
    p.className = 'mv-ping' + (side >= 0 ? ' s' + side : '');
    p.style.left = a[0] / 10 + '%';
    p.style.top = a[1] / 10 + '%';
    mapIn.appendChild(p);
    setTimeout(() => p.remove(), 1300);
  }
  function beam(from, to, side, slow) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', from[0]); line.setAttribute('y1', from[1]); line.setAttribute('x2', to[0]); line.setAttribute('y2', to[1]);
    line.setAttribute('class', 'beam s' + side + (slow ? ' slow' : ''));
    beams.appendChild(line);
    setTimeout(() => line.remove(), slow ? 1500 : 650);
  }

  /* ---------- tableau de bord ---------- */
  function setClock(t) {
    clockT = Math.max(0, t);
    const text = clockText(clockT);
    if (H.clock.textContent !== text) H.clock.textContent = text;
  }
  function drawKda(i) { kdaEls[i].textContent = kda[i].k + '/' + kda[i].d + '/' + kda[i].a; }
  function hud(ev) {
    for (const s of [0, 1]) {
      score[s] = ev.sc[s];
      set('k' + s, ev.sc[s]); set('g' + s, kilo(ev.g[s])); set('tw' + s, ev.tw[s]); set('bn' + s, ev.bn[s]);
      root.querySelectorAll('[data-dr="' + s + '"] i').forEach((pip, k) => pip.classList.toggle('on', k < ev.dr[s]));
      root.querySelector('[data-dr="' + s + '"]').classList.toggle('soul', ev.dr[s] >= 4);
    }
    const lead = ev.g[0] - ev.g[1];
    H.lead.textContent = Math.abs(lead) < 150 ? 'égalité' : '+' + kilo(Math.abs(lead));
    H.lead.className = Math.abs(lead) < 150 ? '' : 's' + (lead > 0 ? 0 : 1);
    /* la barre d'or grossit l'écart pour qu'il se voie */
    H.bar.style.width = clamp(50 + (ev.g[0] / (ev.g[0] + ev.g[1]) - 0.5) * 400, 6, 94).toFixed(1) + '%';
  }
  function say(ev) {
    const p = document.createElement('p');
    p.className = 'mv-line' + (ev.s >= 0 ? ' s' + ev.s : '') + (ev.hl ? ' hl' : '');
    p.innerHTML = '<time>' + clockText(ev.t) + '</time><span>' + esc(ev.txt) + '</span>';
    cast.prepend(p);
    while (cast.children.length > 6) cast.lastChild.remove();
  }
  /** Fait tomber (ou relève) un bâtiment de la carte. */
  function fall(key, down, quiet) {
    const node = built.get(key);
    if (!node || node.classList.contains('down') === down) return;
    node.classList.toggle('down', down);
    if (down && !quiet && fx) { const c = clientOf(node); particles.burst(c[0], c[1], { count: 22, colors: GOLD, speed: [60, 260], life: [0.4, 1], size: [1.5, 4], gravity: 300 }); }
  }
  function structures(st, quiet) {
    for (const side of [0, 1]) {
      for (let l = 0; l < 3; l++) for (let k = 0; k < 4; k++) fall('' + side + l + k, st[side][l] > k, quiet);
      for (let k = 0; k < 2; k++) fall('n' + side + k, st[side][3] > k, quiet);
    }
    lost = st;
  }
  function pulsePit(ev) {
    const name = ev.k === 'dragon' || ev.k === 'elder' ? 'drake' : ev.k === 'baron' || ev.k === 'herald' || ev.k === 'grubs' ? 'baron' : '';
    const node = name && ev.s >= 0 ? root.querySelector('[data-pit="' + name + '"]') : null;
    if (!node) return;
    node.setAttribute('class', 'm-pit');
    void node.getBoundingClientRect();
    node.setAttribute('class', 'm-pit take s' + ev.s);
  }

  /* ---------- une élimination ---------- */
  function strike(kill, slow) {
    const killer = kill[0], victim = kill[1], side = killer < 5 ? 0 : 1;
    beam(pos[killer], pos[victim], side, slow);
    setDead(victim, true);
    pop(tokens[victim]);
    sfx.kill();
    if (fx) { const c = clientOf(tokens[victim]); particles.burst(c[0], c[1], { count: slow ? 26 : 10, colors: SIDE_COLORS[side], speed: [50, slow ? 260 : 180], life: [0.35, slow ? 1.1 : 0.7], size: [1.5, 4], gravity: 80 }); }
    if (slow) return;
    /* le score ne compte qu'en direct, pas pendant le ralenti */
    score[side]++;
    kda[killer].k++; kda[victim].d++;
    for (const a of kill[2]) { kda[a].a++; drawKda(a); }
    drawKda(killer); drawKda(victim);
    set('k' + side, score[side]);
    deadUntil[victim] = clockT + 12 + (clockT / 60) * 1.7;
  }

  /* ---------- déroulé ---------- */
  /** Le temps passe jusqu'au prochain événement : l'horloge tourne, chacun regagne sa place. */
  async function travel(ev) {
    const from = clockT, span = ev.t - from;
    let next = 0;
    idle();
    await nap(clamp(span * 62, 1300, 3300), (part) => {
      setClock(from + span * part);
      const now = performance.now();
      if (now > next) { next = now + 1100; idle(); }
    });
    setClock(ev.t);
  }
  /** Un événement, en direct. */
  async function show(ev, n) {
    const mine = run, a = anchor(ev, n), who = castOf(ev);
    for (const i of who) { deadUntil[i] = 0; setDead(i, false); }
    place(who, a);
    ping(a, ev.s);
    say(ev);
    if (ev.k === 'tower' || ev.k === 'inhib') sfx.tower();
    else if (ev.k === 'baron' || ev.k === 'elder') sfx.objective(true);
    else if (ev.k === 'dragon' || ev.k === 'herald' || ev.k === 'grubs') sfx.objective(false);
    await nap(480);
    for (const kill of ev.kills) {
      if (stopped(mine)) return;
      strike(kill, false);
      await nap(250);
    }
    if (stopped(mine)) return;
    if (ev.st) structures(ev.st, false);
    pulsePit(ev);
    if (ev.k === 'nexus') explode(ev);
    hud(ev);
    await nap(ev.k === 'nexus' ? 1700 : ev.kills.length ? 560 : 760);
  }
  function explode(ev) {
    const loser = 1 - ev.s, node = built.get('x' + loser);
    node.classList.add('down');
    sfx.nexus();
    if (!fx) return;
    const c = clientOf(node), flash = $('.mv-flash');
    flash.style.setProperty('--cx', c[0] + 'px');
    flash.style.setProperty('--cy', c[1] + 'px');
    flash.style.setProperty('--beam', SIDE_COLORS[ev.s][0]);
    pop(flash);
    particles.burst(c[0], c[1], { count: 150, colors: SIDE_COLORS[loser].concat(GOLD), speed: [120, 760], life: [0.7, 1.9] });
  }
  /** Le ralenti : la carte se resserre sur l'action, qui est rejouée lentement, élimination par élimination. */
  async function slowmo(ev, n) {
    const mine = run, a = anchor(ev, n), foot = banner.querySelector('.mv-replay-foot');
    skipSlow = false;
    banner.querySelector('b').textContent = ev.hl;
    foot.innerHTML = '<em>Touche pour passer</em>';
    root.classList.add('slow');
    sfx.slowmo();
    /* on remonte le temps : les victimes sont de nouveau debout */
    for (const kill of ev.kills) setDead(kill[1], false);
    const cx = clamp(a[0], 260, 740), cy = clamp(a[1], 260, 740);
    mapIn.style.transform = 'translate(' + (50 - cx / 5).toFixed(2) + '%,' + (50 - cy / 5).toFixed(2) + '%) scale(2)';
    await nap(950, null, 2);
    const streak = new Map();
    for (const kill of ev.kills) {
      if (stopped(mine)) break;
      strike(kill, true);
      const c = (streak.get(kill[0]) || 0) + 1;
      streak.set(kill[0], c);
      /* dans la bande du bas, là où rien ne cache l'action : qui élimine qui */
      foot.innerHTML = '<p class="mv-kill s' + (kill[0] < 5 ? 0 : 1) + '"><img src="' + iconUrl(cat, P[kill[0]].champ) + '" alt=""><b>' + esc(P[kill[0]].name) + '</b>' + icon('i-play')
        + '<span>' + esc(P[kill[1]].name) + '</span><img class="v" src="' + iconUrl(cat, P[kill[1]].champ) + '" alt="">' + (c > 1 ? '<em>' + STREAK[Math.min(5, c)] + '</em>' : '') + '</p>';
      await nap(1000, null, 2);
    }
    if (!ev.kills.length) { pulsePit(ev); await nap(1700, null, 2); }
    await nap(650, null, 2);
    mapIn.style.transform = 'translate(0%,0%) scale(1)';
    root.classList.remove('slow');
    for (const kill of ev.kills) setDead(kill[1], true);
    skipSlow = false;
    await nap(520);
  }
  function reset() {
    run++;
    skipped = false; paused = false; skipSlow = false;
    lost = [[0, 0, 0, 0], [0, 0, 0, 0]];
    built.forEach((node) => node.classList.remove('down'));
    score[0] = 0; score[1] = 0;
    setClock(0);
    P.forEach((p, i) => { kda[i] = { k: 0, d: 0, a: 0 }; deadUntil[i] = 0; setDead(i, false); drawKda(i); goHome(i, false); });
    cast.innerHTML = '<p class="mv-line"><time>0:00</time><span>Bienvenue sur la Faille de l\'invocateur : ' + esc(M.teams[0].name) + ' contre ' + esc(M.teams[1].name) + '.</span></p>';
    hud({ sc: [0, 0], g: [2500, 2500], tw: [0, 0], dr: [0, 0], bn: [0, 0] });
    root.classList.remove('slow');
    mapIn.style.transform = 'translate(0%,0%) scale(1)';
    beams.innerHTML = '';
    drawCtrl();
  }
  /** L'état de fin de partie, quand on saute le déroulé. */
  function finalState() {
    const last = events[events.length - 1];
    setClock(sim.duration);
    structures(last.st || lost, true);
    built.get('x' + (1 - sim.winner)).classList.add('down');
    hud(last);
    P.forEach((p, i) => { kda[i] = sim.players[i]; drawKda(i); });
    root.classList.remove('slow');
    mapIn.style.transform = 'translate(0%,0%) scale(1)';
  }
  async function playGame() {
    if (playing) return;
    playing = true;
    reset();
    stage('game');
    const mine = run;
    for (let n = 0; n < events.length && !stopped(mine); n++) {
      await travel(events[n]);
      if (stopped(mine)) break;
      await show(events[n], n);
      if (events[n].hl && fx && !stopped(mine)) await slowmo(events[n], n);
    }
    playing = false;
    if (closed || mine !== run) return;
    finalState();
    showEnd();
  }

  /* ---------- le résultat ---------- */
  function showEnd() {
    const won = !!rewards.won, w = sim.winner, mvp = P[sim.mvp], ms = sim.players[sim.mvp];
    const row = (i) => {
      const p = P[i], s = sim.players[i];
      return '<tr' + (i === sim.mvp ? ' class="mvp"' : '') + '><td><img src="' + iconUrl(cat, p.champ) + '" alt="" loading="lazy"></td><td><b>' + esc(p.name) + (i === sim.mvp ? ' <em>MVP</em>' : '') + '</b><i>' + ROLE_LABEL[p.role] + ' · ' + esc(p.champName) + '</i></td>'
        + '<td class="num">' + s.k + '</td><td class="num">' + s.d + '</td><td class="num">' + s.a + '</td></tr>';
    };
    const board = (s) => '<table class="sb s' + s + '"><thead><tr><th colspan="2">' + esc(M.teams[s].name) + (s === w ? ' <em>vainqueur</em>' : '') + '</th><th class="num">K</th><th class="num">D</th><th class="num">A</th></tr></thead>'
      + '<tbody>' + [0, 1, 2, 3, 4].map((r) => row(s * 5 + r)).join('') + '</tbody></table>';
    const line = (label, a, b) => '<tr><td class="num">' + a + '</td><th>' + label + '</th><td class="num">' + b + '</td></tr>';
    const pickRow = (s, r) => {
      const p = P[s * 5 + r], rep = data.report.picks[s][r];
      return '<tr><td><img src="' + iconUrl(cat, p.champ) + '" alt="" loading="lazy"></td><td><b>' + esc(p.champName) + '</b><i>' + esc(p.name) + '</i></td>'
        + '<td class="num">' + signed(rep.meta) + '</td><td class="num">' + signed(rep.comfort) + '</td><td class="num">' + signed(rep.counter) + '</td><td class="num"><b>' + signed(rep.total) + '</b></td></tr>';
    };
    const draft = (s) => '<table class="sb dr-rep s' + s + '"><thead><tr><th colspan="2">' + esc(M.teams[s].name) + '</th><th class="num">Méta</th><th class="num">Confort</th><th class="num">Duel</th><th class="num">Total</th></tr></thead>'
      + '<tbody>' + [0, 1, 2, 3, 4].map((r) => pickRow(s, r)).join('') + '</tbody>'
      + '<tfoot><tr><td colspan="6">Composition ' + signed(data.report.comp[s].bonus) + ' par joueur' + (data.report.comp[s].notes.length ? ' : ' + esc(data.report.comp[s].notes.join(', ').toLowerCase()) : '') + '</td></tr></tfoot></table>';
    let prize;
    if (rewards.replay) prize = '<div class="prize"><span>Rediffusion</span><b>' + (won ? 'Victoire' : 'Défaite') + '</b><i>Les récompenses ont déjà été versées.</i></div>';
    else {
      prize = '<div class="prize"><span>' + (won ? 'Récompense' : 'Lot de consolation') + '</span><b>+' + rewards.coins + ' crédits</b>'
        + (rewards.easy ? '<i>Adversaire bien plus faible : gain réduit.</i>' : '') + '</div>'
        + (rewards.pack ? '<div class="prize bonus"><span>Première victoire contre ' + esc(foeTeam ? foeTeam.name : M.opp) + '</span><b>+1 pack</b><i>Il t\'attend dans l\'onglet Packs.</i></div>' : '');
    }
    endEl.innerHTML = '<div class="end-box panel ' + (won ? 'win' : 'lose') + '"><div class="end-title">' + (won ? 'Victoire' : 'Défaite') + '</div>'
      + '<div class="end-score"><span class="s0">' + esc(short(0)) + '</span><b>' + sim.kills[0] + ' – ' + sim.kills[1] + '</b><span class="s1">' + esc(short(1)) + '</span></div>'
      + '<p class="end-sub">' + clockText(sim.duration) + ' de jeu · côté ' + (you === 0 ? 'bleu' : 'rouge') + '</p>'
      + '<div class="end-top"><div class="end-mvp">' + (mvp.card ? cardHTML(mvp.card, cat, { eager: true }) : '<img class="end-mvp-i" src="' + iconUrl(cat, mvp.champ) + '" alt="">')
      + '<div><span>MVP de la partie</span><b>' + esc(mvp.name) + '</b><i>' + ms.k + ' / ' + ms.d + ' / ' + ms.a + ' sur ' + esc(mvp.champName) + '</i></div></div>'
      + '<div class="end-side">' + prize
      + '<table class="end-stats"><thead><tr><td class="num s0">' + esc(short(0)) + '</td><th></th><td class="num s1">' + esc(short(1)) + '</td></tr></thead><tbody>'
      + line('Éliminations', sim.kills[0], sim.kills[1]) + line('Or', kilo(sim.gold[0]), kilo(sim.gold[1])) + line('Tours', sim.towers[0], sim.towers[1])
      + line('Dragons', sim.dragons[0], sim.dragons[1]) + line('Barons', sim.barons[0], sim.barons[1]) + '</tbody></table></div></div>'
      + '<div class="end-actions actions"><button class="btn primary big" type="button" data-go="' + (rewards.pack ? 'packs' : 'jouer') + '">' + (rewards.pack ? 'Ouvrir mon pack' : 'Continuer') + '</button>'
      + (rewards.pack ? '<button class="btn big" type="button" data-go="jouer">Continuer</button>' : '')
      + '<button class="btn big" type="button" data-act="again">' + (fx ? 'Revoir la partie' : 'Voir la partie') + '</button></div>'
      + '<details class="more" open><summary>Joueurs</summary><div class="end-boards">' + board(0) + board(1) + '</div></details>'
      + '<details class="more"><summary>Bilan de la draft</summary><div class="end-boards">' + draft(0) + draft(1) + '</div>'
      + '<p class="note">Le total de chaque joueur (méta, confort, duel, composition) s\'est ajouté à sa force pendant la partie.</p></details>'
      + '<details class="more"><summary>Le fil de la partie</summary><div class="end-feed">' + events.map((e) => '<p class="mv-line' + (e.s >= 0 ? ' s' + e.s : '') + (e.hl ? ' hl' : '') + '"><time>' + clockText(e.t) + '</time><span>' + esc(e.txt) + '</span></p>').join('') + '</div></details>'
      + '</div>';
    stage('end');
    endEl.scrollTop = 0;
    if (won) sfx.victory(); else sfx.defeat();
    if (fx && won && !rewards.replay) particles.fountain(window.innerWidth / 2, window.innerHeight * 0.36, { colors: GOLD, waves: 6 });
  }

  /* ---------- commandes ---------- */
  function drawCtrl() {
    const soundBtn = $('[data-act="sound"]');
    soundBtn.innerHTML = icon(soundOn() ? 'i-sound' : 'i-mute');
    soundBtn.classList.toggle('off', !soundOn());
    $('[data-act="pause"]').innerHTML = icon(paused ? 'i-go' : 'i-pause');
    root.classList.toggle('paused', paused);
    /* les pions vont plus vite quand la partie est accélérée */
    root.style.setProperty('--k', String(speed));
    root.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === speed));
  }
  root.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { close(); done({ goTo: go.dataset.go }); return; }
    const sp = e.target.closest('[data-speed]');
    if (sp) { speed = Number(sp.dataset.speed); try { localStorage.setItem(STORE + 'vitesse', String(speed)); } catch (err) { /* réglage non gardé */ } drawCtrl(); sfx.click(); return; }
    const a = e.target.closest('[data-act]');
    if (a) {
      const what = a.dataset.act;
      if (what === 'sound') { setSound(!soundOn()); drawCtrl(); sfx.click(); }
      else if (what === 'pause') { paused = !paused; drawCtrl(); }
      else if (what === 'skip') { skipped = true; if (!playing) { finalState(); showEnd(); } }
      else if (what === 'start') { if (fx) { playGame(); } else { finalState(); showEnd(); } }
      else if (what === 'again') playGame();
      return;
    }
    /* pendant un ralenti, toucher la carte le passe */
    if (root.classList.contains('slow') && e.target.closest('.mv-map')) skipSlow = true;
  });
  function onKey(e) {
    if (root.dataset.stage !== 'game') return;
    if (e.key === ' ') { e.preventDefault(); paused = !paused; drawCtrl(); }
    else if (e.key === 'Escape') { if (root.classList.contains('slow')) skipSlow = true; else skipped = true; }
  }
  function close() {
    closed = true;
    document.removeEventListener('keydown', onKey);
    particles.destroy();
    root.remove();
    document.body.style.overflow = scroll;
  }
  document.addEventListener('keydown', onKey);
  reset();
  if (fx) sfx.versus();
  return new Promise((resolve) => { done = resolve; });
}
