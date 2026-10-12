/* Le match : présentation des deux équipes, partie rejouée sur la carte avec commentaires et ralentis, puis résultat.
   Le serveur a déjà joué toute la partie ; il envoie la suite des événements et cet écran les met en scène. */
import { cardHTML, esc, iconUrl, logoHTML } from './cards.js';
import { DDRAGON, ROLE_LABEL, STORE } from './config.js';
import { createFans } from './fans.js';
import { createFx } from './fx.js';
import { KITS, RESOURCES, SPELLS, SPELL_DEFAULT, SPELL_PICKS } from './kits.js';
import { CAMPS, KILL_GAP, NEXUS, NEXUS_TOWERS, PIT, SHOW_LEAD, STRUCT, TRAILS, planMoves, sample } from './moves.js';
import { cheer } from './music.js';
import { ROLES, signed } from './rules.js';
import { sfx, soundOn } from './sound.js';
import { closeVolume, toggleVolume } from './volume.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const clockText = (sec) => Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');
const kilo = (g) => (Math.round(g / 100) / 10).toFixed(1).replace('.', ',') + 'k';
const icon = (id) => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + id + '"/></svg>';
const SIDE_COLORS = [['#4ea3ff', '#bfe0ff', '#ffffff'], ['#f0586a', '#ffc2c9', '#ffffff']];
const GOLD = ['#f0e6d2', '#c8aa6e', '#ffe7a8', '#ffffff'];
const STREAK = ['', '', 'Doublé', 'Triplé', 'Quadruplé', 'Pentakill'];

/* La carte est un carré de 1000 de côté, base bleue en bas à gauche, base rouge en haut à droite.
   Sa géométrie (bâtiments, fosses, camps, sentiers) et les trajets des joueurs sont dans moves.js. */

function mapSVG() {
  const lanes = ['M92 868V162Q92 92 162 92H868', 'M152 848 848 152', 'M132 908H838Q908 908 908 838V132'];
  const diamond = (p, r) => 'M' + p[0] + ' ' + (p[1] - r) + 'L' + (p[0] + r) + ' ' + p[1] + 'L' + p[0] + ' ' + (p[1] + r) + 'L' + (p[0] - r) + ' ' + p[1] + 'Z';
  /* sous chaque fosse, le compte à rebours du retour du dragon ou du Nashor */
  const pit = (name, sym) => '<g class="m-pit" data-pit="' + name + '"><circle cx="' + PIT[name][0] + '" cy="' + PIT[name][1] + '" r="40"/>'
    + '<use href="#' + sym + '" x="' + (PIT[name][0] - 21) + '" y="' + (PIT[name][1] - 21) + '" width="42" height="42"/>'
    + '<text class="m-timer" data-timer="' + name + '" x="' + PIT[name][0] + '" y="' + (PIT[name][1] + 72) + '" text-anchor="middle"></text></g>';
  let s = '<svg class="mv-svg" viewBox="0 0 1000 1000" aria-hidden="true"><defs>'
    + '<radialGradient id="mvBase0" cx="0" cy="1" r="1"><stop offset="0" stop-color="#4ea3ff" stop-opacity=".42"/><stop offset="1" stop-color="#4ea3ff" stop-opacity="0"/></radialGradient>'
    + '<radialGradient id="mvBase1" cx="1" cy="0" r="1"><stop offset="0" stop-color="#f0586a" stop-opacity=".42"/><stop offset="1" stop-color="#f0586a" stop-opacity="0"/></radialGradient>'
    + '<pattern id="mvHatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.5" height="16" fill="#c8aa6e" fill-opacity=".055"/></pattern></defs>'
    + '<rect class="m-ground" width="1000" height="1000"/><rect width="1000" height="1000" fill="url(#mvHatch)"/>'
    + '<rect x="0" y="640" width="360" height="360" fill="url(#mvBase0)"/><rect x="640" y="0" width="360" height="360" fill="url(#mvBase1)"/>'
    /* les sentiers de la jungle, sous la rivière et les voies */
    + '<path class="m-trail" d="' + TRAILS.map(([a, b]) => 'M' + a[0] + ' ' + a[1] + 'L' + b[0] + ' ' + b[1]).join('') + '"/>'
    + '<path class="m-river" d="M168 212C300 310 430 430 500 500S700 690 832 788"/><path class="m-river-line" d="M168 212C300 310 430 430 500 500S700 690 832 788"/>'
    + lanes.map((d) => '<path class="m-lane" d="' + d + '"/>').join('') + lanes.map((d) => '<path class="m-lane-line" d="' + d + '"/>').join('')
    /* les bases, puis les camps de la jungle : les deux buffs de chaque équipe (grands losanges), les petits camps, les crabes de la rivière */
    + '<path class="m-base s0" d="M0 700A300 300 0 0 1 300 1000"/><path class="m-base s1" d="M700 0A300 300 0 0 0 1000 300"/>'
    + CAMPS.map((c) => (c.kind === 'crab' ? '<circle class="m-camp crab" data-camp="' + c.id + '" cx="' + c.p[0] + '" cy="' + c.p[1] + '" r="10"/>'
      : '<path class="m-camp ' + c.kind + '" data-camp="' + c.id + '" d="' + diamond(c.p, c.kind === 'camp' ? 10 : 15) + '"/>')).join('')
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

/** Montre un match. data : { match, report, sim, rewards } tel que le serveur l'envoie. Renvoie { goTo } quand le joueur referme l'écran.
    Pour une manche de série (défi, Mondial), rewards peut porter son propre habillage du résultat : title (« Manche gagnée »),
    sub (« BO3 · 1 – 0 »), html (le cadre de la récompense), next (le libellé du bouton pour continuer). */
export function runMatch({ data, cat, fx }) {
  const M = data.match, sim = data.sim, events = sim.events, you = M.you, rewards = data.rewards || {};
  /* les dix joueurs : 0 à 4 pour les bleus (TOP, JGL, MID, ADC, SUP), 5 à 9 pour les rouges */
  const P = [];
  for (const side of [0, 1]) {
    M.teams[side].players.forEach((p, r) => {
      const champ = M.picks[side][r];
      /* ce que Riot dit de son champion : sa ressource (m mana, e énergie, n aucune, les autres montent quand on se bat) et son ultime */
      const kit = KITS[champ] || null, info = cat.champions[champ] || {};
      P.push({ side, role: ROLES[r], name: p.name || 'Remplaçant', card: (p.id && cat.cardById.get(p.id)) || null, champ, champName: info.n || champ,
        res: kit ? kit[0] : 'm', ult: kit ? kit[1] : '', ultCd: kit ? kit[2] : null, ultEarly: !!(kit && kit[3]),
        /* un champion de duel (combattant, assassin) : au milieu, il ira tenir une voie de côté en fin de partie */
        split: info.t === 'Fighter' || info.t === 'Assassin',
        /* ses deux sorts d'invocateur : ceux que les pros prennent sur ce champion à ce poste, sinon ceux du poste */
        sums: ((SPELL_PICKS[champ] && SPELL_PICKS[champ][ROLES[r]]) || SPELL_DEFAULT[ROLES[r]] || '').split('').filter((l) => SPELLS[l]) });
    });
  }
  const short = (s) => M.teams[s].short;
  const foeTeam = cat.teamById.get(M.opp);
  /* La Karmine joue-t-elle ? Son équipe en face, ou trois de ses joueurs au moins (d'aujourd'hui, ou en édition KC) dans la mienne : sa
     tribune s'entend alors, très loin derrière la musique, et s'anime quand elle marque (music.js). kcSide : son camp, −1 sinon. */
  const kcSide = M.opp === 'KC' ? 1 - you : P.filter((p) => p.side === you && p.card && (p.card.team === 'KC' || p.card.variant === 'kc')).length >= 3 ? you : -1;

  /* ---------- l'écran ---------- */
  const strip = (i) => {
    const p = P[i], rep = data.report.picks[p.side][i % 5];
    return '<div class="vs-strip" style="--art:url(' + DDRAGON + '/img/champion/loading/' + p.champ + '_0.jpg)">'
      + '<span class="vs-role">' + ROLE_LABEL[p.role] + '</span><span class="vs-val ' + (rep.total >= 0 ? 'up' : 'down') + '" title="Bilan de draft">' + signed(rep.total) + '</span>'
      + '<span class="vs-name"><b>' + esc(p.name) + '</b><i>' + esc(p.champName) + '</i></span></div>';
  };
  const draftSum = (s) => data.report.picks[s].reduce((sum, p) => sum + p.total, 0);
  /* le logo de l'équipe adverse (celle du joueur n'en a pas : c'est son équipe à lui) */
  const crest = (s) => (s === you ? '' : logoHTML(M.opp, 'logo', 80));
  const vsTeam = (s) => '<div class="vs-team s' + s + '"><div class="vs-head">' + crest(s) + '<b>' + esc(M.teams[s].name) + '</b><span>' + M.teams[s].rating + '</span>'
    + '<i>' + (s === you ? 'Toi · ' : '') + (s === 0 ? 'côté bleu' : 'côté rouge') + ' · draft ' + signed(draftSum(s)) + '</i></div>'
    + '<div class="vs-strips">' + [0, 1, 2, 3, 4].map((r) => strip(s * 5 + r)).join('') + '</div></div>';
  const stat = (sym, key, value) => '<span class="mv-s">' + icon(sym) + '<b data-h="' + key + '">' + value + '</b></span>';
  const hudTeam = (s) => '<div class="mv-t s' + s + '"><span class="mv-tn">' + crest(s) + esc(short(s)) + (s === you ? '<em>toi</em>' : '') + '</span><b data-h="k' + s + '">0</b></div>';
  const hudObj = (s) => '<div class="mv-o s' + s + '">' + stat('i-coin', 'g' + s, '2,5k') + stat('i-tower', 'tw' + s, '0')
    + '<span class="mv-s">' + icon('i-drake') + '<span class="mv-dr" data-dr="' + s + '"><i></i><i></i><i></i><i></i></span></span>' + stat('i-baron', 'bn' + s, '0') + '</div>';
  const sideHTML = (s) => '<aside class="mv-side s' + s + '">' + [0, 1, 2, 3, 4].map((r) => {
    const i = s * 5 + r, p = P[i];
    /* la pastille ronde sur le portrait : verte quand l'ultime (R) est disponible, comme dans le jeu */
    return '<div class="mv-p" data-p="' + i + '"><span class="mv-pw"><span class="mv-pi"><img src="' + iconUrl(cat, p.champ) + '" alt="" draggable="false"></span><i class="mv-r" data-r="' + i + '" title="Ultime (R)' + (p.ult ? ' : ' + esc(p.ult) : '') + '"></i>'
      /* le niveau du champion, comme sur le tableau des scores du jeu */
      + '<b class="mv-lv" data-lv="' + i + '" title="Niveau">1</b></span>'
      /* ses deux sorts d'invocateur : grisés, avec les secondes qui restent, tant qu'ils ne sont pas revenus */
      + '<span class="mv-sp">' + p.sums.map((l, k) => '<i class="mv-sum" data-sum="' + i + '-' + k + '" title="' + esc(SPELLS[l][0]) + '">'
        + '<img src="' + DDRAGON + '/' + cat.ddragon + '/img/spell/' + SPELLS[l][2] + '.png" alt="" draggable="false"><b></b></i>').join('') + '</span>'
      + '<span class="mv-pn"><b>' + esc(p.name) + '</b><i>' + ROLE_LABEL[p.role] + ' · ' + esc(p.champName) + '</i></span>'
      + '<span class="mv-pk"><b data-kda="' + i + '">0/0/0</b><i data-cs="' + i + '" title="Sbires tués">0 CS</i></span>'
      /* sa vie, et sa ressource quand son champion en a une (mana, énergie, rage…) */
      + '<span class="mv-bars"><i class="mv-hp" title="Vie"><u data-hpl="' + i + '"></u><b data-hp="' + i + '"></b></i>'
      + (p.res === 'n' ? '' : '<i class="mv-mp r-' + p.res + '" title="' + esc(RESOURCES[p.res] || 'Ressource') + '"><b data-mp="' + i + '"></b></i>') + '</span></div>';
  }).join('') + '</aside>';

  const root = document.createElement('div');
  root.className = 'mv';
  root.dataset.stage = 'versus';
  if (kcSide >= 0) root.dataset.crowd = 'kc';
  root.innerHTML = '<canvas class="mv-fx"></canvas><div class="mv-flash"></div>'
    + '<section class="vs">' + vsTeam(0) + '<div class="vs-mid"><i></i><b>VS</b><i></i></div>' + vsTeam(1)
    + '<div class="vs-foot"><button class="btn primary big" type="button" data-act="start">' + (fx ? 'Lancer la partie' : 'Voir le résultat') + '</button></div></section>'
    + '<section class="mv-game"><header class="mv-hud">' + hudTeam(0) + '<div class="mv-clock"><b data-h="clock">0:00</b><span data-h="lead">égalité</span></div>' + hudTeam(1)
    + hudObj(0) + '<div class="mv-gold"><i data-h="bar"></i></div>' + hudObj(1) + '</header>'
    + '<div class="mv-mid">' + sideHTML(0)
    + '<div class="mv-map"><div class="mv-map-in">' + mapSVG() + '<svg class="mv-beams" viewBox="0 0 1000 1000" aria-hidden="true"></svg></div>'
    + '<div class="mv-replay"><div class="mv-replay-top"><span>Temps fort</span><b></b></div><div class="mv-replay-foot"></div></div></div>'
    + sideHTML(1) + '</div>'
    /* le commentaire : l'action en cours dans un bandeau, les précédentes au-dessous ; à côté, de temps en temps, la réaction (inventée) d'un fan */
    + '<div class="mv-cast"><div class="mv-talk" aria-live="polite"><article class="mv-now"></article><div class="mv-past"></div></div><aside class="mv-social"></aside></div>'
    + '<footer class="mv-ctrl"><button class="op-icon" type="button" data-act="pause" aria-label="Pause ou reprise"></button>'
    + '<div class="mv-speed" role="group" aria-label="Vitesse">' + [1, 2, 4].map((v) => '<button type="button" data-speed="' + v + '">×' + v + '</button>').join('') + '</div>'
    + '<span class="spacer"></span><button class="op-icon" type="button" data-act="sound" aria-haspopup="dialog" aria-label="Régler le son"></button>'
    + '<button class="btn" type="button" data-act="skip">Passer</button></footer></section>'
    + '<section class="mv-end"></section>';
  const $ = (sel) => root.querySelector(sel);
  const mapEl = $('.mv-map'), mapIn = $('.mv-map-in'), beams = $('.mv-beams'), banner = $('.mv-replay'), endEl = $('.mv-end');
  const nowEl = $('.mv-now'), pastEl = $('.mv-past'), socialEl = $('.mv-social');
  const H = {};
  root.querySelectorAll('[data-h]').forEach((n) => { H[n.dataset.h] = n; });
  const built = new Map(Array.from(root.querySelectorAll('[data-b]'), (n) => [n.dataset.b, n]));
  const rows = P.map((p, i) => root.querySelector('.mv-p[data-p="' + i + '"]'));
  const kdaEls = P.map((p, i) => root.querySelector('[data-kda="' + i + '"]'));
  const csEls = P.map((p, i) => root.querySelector('[data-cs="' + i + '"]')), ultEls = P.map((p, i) => root.querySelector('[data-r="' + i + '"]'));
  const lvEls = P.map((p, i) => root.querySelector('[data-lv="' + i + '"]'));
  const pitEls = { drake: root.querySelector('[data-pit="drake"]'), baron: root.querySelector('[data-pit="baron"]') };
  const pitUse = { drake: pitEls.drake.querySelector('use'), baron: pitEls.baron.querySelector('use') };
  const timerEls = { drake: root.querySelector('[data-timer="drake"]'), baron: root.querySelector('[data-timer="baron"]') };
  const tokens = P.map((p) => {
    const d = document.createElement('div');
    d.className = 'tk s' + p.side;
    /* le portrait et, au-dessus, discrètes, sa barre de vie et celle de sa ressource (quand son champion en a une) */
    d.innerHTML = '<span class="tk-i"><img src="' + iconUrl(cat, p.champ) + '" alt="" draggable="false"></span>'
      + '<span class="tk-bars"><i class="tk-hp"><b></b></i>' + (p.res === 'n' ? '' : '<i class="tk-mp r-' + p.res + '"><b></b></i>') + '</span>';
    mapIn.appendChild(d);
    return d;
  });
  const hpEls = tokens.map((d) => d.querySelector('.tk-hp b')), mpEls = tokens.map((d) => d.querySelector('.tk-mp b'));
  const hpRows = P.map((p, i) => root.querySelector('[data-hp="' + i + '"]')), mpRows = P.map((p, i) => root.querySelector('[data-mp="' + i + '"]'));
  const hpLag = P.map((p, i) => root.querySelector('[data-hpl="' + i + '"]'));
  const sumEls = P.map((p, i) => p.sums.map((l, k) => root.querySelector('[data-sum="' + i + '-' + k + '"]')));
  const scroll = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(root);
  const particles = createFx($('.mv-fx'));

  /* ---------- état de la partie affichée ---------- */
  let speed = 1, paused = false, skipped = false, skipSlow = false, closed = false, playing = false, run = 0, done = null;
  try { speed = Number(localStorage.getItem(STORE + 'vitesse')) || 1; } catch (e) { speed = 1; }
  if (![1, 2, 4].includes(speed)) speed = 1;
  let clockT = 0, lost = [[0, 0, 0, 0], [0, 0, 0, 0]];
  const pos = P.map(() => [500, 500]), kda = P.map(() => ({ k: 0, d: 0, a: 0 })), score = [0, 0];
  /* Les déplacements de toute la partie sont calculés d'avance (moves.js). tau : l'instant affiché, en millisecondes à vitesse ×1. */
  const plan = planMoves(sim, P.map((p) => ({ res: p.res === 'm' ? 'mana' : p.res === 'e' ? 'energy' : p.res === 'n' ? 'none' : 'build', cd: p.ultCd, early: p.ultEarly, split: p.split,
    sums: p.sums.map((l) => [l, SPELLS[l][1]]) })));
  let tau = 0, lastDraw = 0;
  const cursor = P.map(() => 0), shown = P.map(() => null), look = P.map(() => '?');

  /* ---------- ce que le serveur ne compte pas, et qu'une vraie partie affiche : farm, niveau, vie et ressource de chacun, retour des monstres épiques ---------- */
  const csLook = P.map(() => -1), ultLook = P.map(() => null), lvLook = P.map(() => 0), timerLook = { drake: '?', baron: '?' };
  const hpLook = P.map(() => -1), mpLook = P.map(() => -1), sumLook = P.map(() => [-1, -1]);
  /** Règle la barre de vie du joueur i, sur son portrait (et sur son pion, pour les temps forts) : part, de 0 à 1. Quand il prend un coup,
      la vie perdue reste marquée un instant avant de fondre : on lit l'échange d'un coup d'œil. De même sa ressource, s'il en a une. */
  function setHp(i, part) {
    const v = Math.round(clamp(part, 0, 1) * 100), was = hpLook[i];
    if (v === was) return;
    hpLook[i] = v;
    hpEls[i].style.width = v + '%'; hpRows[i].style.width = v + '%';
    /* la vie qui remonte ne laisse pas de trace : la marque suit aussitôt */
    if (v > was) { hpLag[i].style.transition = 'none'; hpLag[i].style.width = v + '%'; void hpLag[i].offsetWidth; hpLag[i].style.transition = ''; }
    else hpLag[i].style.width = v + '%';
    const low = v > 0 && v < 30;
    hpEls[i].classList.toggle('low', low); hpRows[i].classList.toggle('low', low);
  }
  function setMp(i, part) {
    if (!mpRows[i]) return;
    const v = Math.round(clamp(part, 0, 1) * 100);
    if (v === mpLook[i]) return;
    mpLook[i] = v;
    mpRows[i].style.width = v + '%'; mpEls[i].style.width = v + '%';
  }
  /** Les sorts d'invocateur du joueur i : prêts, ou grisés avec les secondes qui restent. */
  function setSums(i) {
    for (let k = 0; k < sumEls[i].length; k++) {
      const left = Math.ceil(plan.sumLeft(i, k, tau));
      if (left === sumLook[i][k]) continue;
      sumLook[i][k] = left;
      sumEls[i][k].classList.toggle('cd', left > 0);
      sumEls[i][k].lastChild.textContent = left > 0 ? left : '';
    }
  }
  const frac = (x) => x - Math.floor(x), jitter = (i) => frac(Math.sin((sim.duration + 7) * (i + 1) * 12.9898) * 43758.5453);
  /* sbires par minute : ceux du joueur cette saison quand on les connaît, sinon l'ordinaire de son poste */
  const CS_RATE = { TOP: 7.8, JGL: 5.6, MID: 8.4, BOT: 9.1, SUP: 1.2 };
  const csRate = P.map((p, i) => ((p.card && p.card.real && p.card.real.cspm) || CS_RATE[p.role]) * (0.93 + 0.14 * jitter(i)) * (p.side === sim.winner ? 1.03 : 0.97));
  const downs = plan.deaths.map((list) => list.map(([a, b]) => [plan.gameAt(a), plan.gameAt(b)]));
  const campsBy = P.map((p, i) => plan.camps.flatMap((c) => c.down.filter((d) => d[2] === i).map((d) => d[0])).sort((a, b) => a - b));
  /** Sbires tués par le joueur i quand l'horloge du jeu marque g secondes (x : l'instant de la mise en scène). On ne farme pas quand on est mort. */
  function csAt(i, g, x) {
    let alive = g;
    for (const [a, b] of downs[i]) if (a < g) alive -= Math.min(b, g) - a;
    if (P[i].role === 'JGL') {
      /* le jungler : quatre par camp qu'on le voit tuer, plus un peu de farm sur les voies une fois la phase de lane passée */
      let camps = 0;
      for (const t of campsBy[i]) { if (t <= x) camps++; else break; }
      return camps * 4 + Math.floor((Math.max(0, alive - 840) / 60) * 1.5);
    }
    /* les sbires partent à 0:30 et arrivent sur les voies vers 0:55 */
    return Math.floor((csRate[i] * Math.max(0, alive - 55)) / 60);
  }
  /* Les monstres épiques, avec les vrais délais du jeu (saison 2026). La fosse du haut accueille tour à tour les larves du Néant (8:00 ; parties à 14:45
     si personne ne les a prises), le Héraut de la Faille (15:00 ; parti à 19:45) puis le Baron Nashor (20:00, de retour 6:00 après sa mort) ; celle du
     bas, le dragon (5:00, de retour 5:00 après sa mort) puis, quand une équipe a pris l'âme, le Dragon ancestral (6:00 après, et 6:00 après chaque mort).
     Pour chaque fosse, la suite de ses occupants : [qui, arrivée, départ], en secondes de jeu. Un serveur d'avant ces réglages peut avoir pris un
     objectif un peu plus tôt : son arrivée est alors avancée d'autant, pour qu'on ne le voie pas tomber avant d'être apparu. */
  const PIT_SYM = { grubs: 'i-grubs', herald: 'i-herald', baron: 'i-baron', drake: 'i-drake', elder: 'i-drake' };
  const stays = { baron: [], drake: [] };
  {
    const taken = (k) => events.filter((e) => e.k === k).map((e) => e.t);
    const early = (from, t) => (t === undefined ? from : Math.min(from, t - 12));
    const grubs = taken('grubs')[0], herald = taken('herald')[0];
    stays.baron.push(['grubs', early(480, grubs), grubs === undefined ? 885 : grubs], ['herald', early(900, herald), herald === undefined ? 1185 : herald]);
    let from = 1200, who = 'drake';
    for (const t of taken('baron')) { stays.baron.push(['baron', early(from, t), t]); from = t + 360; }
    stays.baron.push(['baron', from, Infinity]);
    from = 300;
    for (const e of events) {
      if (e.k !== 'dragon' && e.k !== 'elder') continue;
      stays.drake.push([e.k === 'elder' ? 'elder' : 'drake', early(from, e.t), e.t]);
      who = e.k === 'elder' || e.dr[0] >= 4 || e.dr[1] >= 4 ? 'elder' : 'drake';
      from = e.t + (who === 'elder' ? 360 : 300);
    }
    stays.drake.push([who, from, Infinity]);
  }
  /** L'occupant d'une fosse quand l'horloge marque g : [qui, secondes avant son arrivée (0 : il est là)]. */
  const pitAt = (name, g) => {
    for (const [who, from, to] of stays[name]) if (g < to) return [who, Math.max(0, from - g)];
    return [stays[name][stays[name].length - 1][0], 0];
  };
  /** Met à jour le farm, les pastilles d'ultime et les comptes à rebours, quand ils changent. */
  function drawLive() {
    const g = clockT;
    for (let i = 0; i < 10; i++) {
      const cs = csAt(i, g, tau), ult = plan.ultReady(i, tau), lv = plan.levelAt(i, tau);
      if (cs !== csLook[i]) { csLook[i] = cs; csEls[i].textContent = cs + ' CS'; }
      if (lv !== lvLook[i]) { if (lvLook[i] && lv > lvLook[i]) pop(lvEls[i]); lvLook[i] = lv; lvEls[i].textContent = lv; }
      if (ult !== ultLook[i]) { ultLook[i] = ult; ultEls[i].classList.toggle('on', ult); }
      setSums(i);
    }
    /* pendant un temps fort, c'est l'action qui règle les barres de vie */
    if (!root.classList.contains('slow')) for (let i = 0; i < 10; i++) { setHp(i, plan.hpAt(i, tau)); setMp(i, plan.resAt(i, tau)); }
    for (const name of ['drake', 'baron']) {
      const [who, left] = pitAt(name, g), text = left > 0 ? clockText(Math.ceil(left)) : '', sig = who + text;
      if (sig === timerLook[name]) continue;
      timerLook[name] = sig;
      timerEls[name].textContent = text;
      pitEls[name].dataset.off = text ? '1' : '';
      pitEls[name].dataset.who = who;
      pitUse[name].setAttribute('href', '#' + PIT_SYM[who]);
    }
  }
  const campEls = plan.camps.map((c) => root.querySelector('[data-camp="' + c.id + '"]')), campLook = plan.camps.map(() => '?');
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
  function setDead(i, dead) {
    tokens[i].classList.toggle('dead', dead);
    if (!dead) tokens[i].classList.remove('away');
    rows[i].classList.toggle('dead', dead);
  }
  /* léger balancement d'un joueur qui attend (h), combat (f) ou tue un camp (c) : [ampleur, période]. La carte vit, même quand personne ne marche. */
  const SWAY = { h: [2.2, 520], f: [6.5, 150], c: [4.5, 190] };
  /** Place les dix pions là où ils se trouvent à l'instant tau. snap : sans adoucir le mouvement (départ, saut dans le temps). */
  function draw(snap) {
    const now = performance.now(), dt = Math.min(120, Math.max(0, now - lastDraw));
    lastDraw = now;
    /* les pions suivent leur trajet avec un très léger retard, qui arrondit les virages */
    const ease = 1 - Math.exp((-dt * speed) / 70);
    const slow = root.classList.contains('slow');
    for (let i = 0; i < 10; i++) {
      const s = sample(plan.tracks[i], tau, cursor[i]);
      cursor[i] = s.j;
      const sw = SWAY[s.k];
      let x = s.x, y = s.y;
      if (sw) { x += Math.sin(tau / sw[1] + i * 1.9) * sw[0]; y += Math.cos(tau / (sw[1] * 1.17) + i * 2.6) * sw[0]; }
      const was = shown[i];
      /* un retour à la base ou une réapparition : le pion change de place d'un coup */
      if (!was || snap || Math.hypot(x - was[0], y - was[1]) > 240) shown[i] = [x, y];
      else shown[i] = [was[0] + (x - was[0]) * ease, was[1] + (y - was[1]) * ease];
      pos[i] = shown[i];
      tokens[i].style.left = (shown[i][0] / 10).toFixed(2) + '%';
      tokens[i].style.top = (shown[i][1] / 10).toFixed(2) + '%';
      /* pendant un ralenti, c'est la mise en scène qui dit qui est debout */
      if (slow) continue;
      const dead = s.k === 'x', back = s.k === 'g', away = back || (dead && tau - plan.tracks[i][s.j].t > 900);
      const sig = (dead ? 'x' : '') + (away ? 'a' : '') + (back ? 'g' : '') + (s.k === 'r' ? 'r' : s.k === 't' ? 't' : '');
      if (sig !== look[i]) {
        /* une Téléportation : l'incantation là où il se trouve, puis un éclat là où il apparaît */
        if (look[i] === 't' && sig === '') pop(tokens[i]);
        tokens[i].classList.toggle('tp', s.k === 't');
        look[i] = sig;
        tokens[i].classList.toggle('dead', dead);
        tokens[i].classList.toggle('away', away);
        tokens[i].classList.toggle('back', back);
        tokens[i].classList.toggle('recall', s.k === 'r');
        rows[i].classList.toggle('dead', dead);
      }
    }
    drawLive();
    /* les camps de la jungle : attaqués, tués, puis de retour */
    plan.camps.forEach((c, k) => {
      let sig = '';
      for (const d of c.down) { if (tau >= d[0] - c.hold && tau < d[0]) sig = ' hit'; else if (tau >= d[0] && tau < d[1]) sig = ' down'; }
      if (sig !== campLook[k]) { campLook[k] = sig; campEls[k].setAttribute('class', 'm-camp ' + c.kind + sig); }
    });
  }
  /** Fait avancer la partie jusqu'à l'instant « to » : l'horloge tourne et chacun suit son trajet. */
  function advance(to) {
    const from = tau, span = to - from;
    if (span <= 0) return Promise.resolve();
    return nap(span, (part) => { tau = from + span * part; setClock(plan.gameAt(tau)); draw(false); });
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
  /* Le commentaire, façon retransmission : l'action en cours dans un bandeau (son pictogramme, son heure, son titre quand c'est un temps fort),
     les deux précédentes au-dessous. Les noms des joueurs et des équipes ressortent dans le texte. */
  const EVENT_ICON = { tower: 'i-tower', inhib: 'i-tower', dragon: 'i-drake', elder: 'i-drake', baron: 'i-baron', herald: 'i-herald', grubs: 'i-grubs', nexus: 'mark', start: 'mark' };
  const rich = (() => {
    const names = new Map();
    P.forEach((p) => { if (p.name.length > 1) names.set(esc(p.name), ''); });
    [0, 1].forEach((s) => { names.set(esc(M.teams[s].short), ' class="s' + s + '"'); names.set(esc(M.teams[s].name), ' class="s' + s + '"'); });
    let re = null;
    try {
      const alt = [...names.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&')).join('|');
      re = new RegExp('(?<![\\p{L}\\p{N}])(' + alt + ')(?![\\p{L}\\p{N}])', 'gu');
    } catch (e) { re = null; }   /* un navigateur trop ancien pour cette recherche : le texte reste tel quel */
    return (txt) => { const safe = esc(txt); return re ? safe.replace(re, (m) => '<b' + (names.get(m) || '') + '>' + m + '</b>') : safe; };
  })();
  const lineHTML = (e) => '<p class="mv-line' + (e.s >= 0 ? ' s' + e.s : '') + (e.hl ? ' hl' : '') + '"><time>' + clockText(e.t) + '</time><span>' + esc(e.txt) + '</span></p>';
  let said = null, fans = null, postAt = -1;
  function say(ev) {
    /* l'action précédente descend dans le fil */
    if (said) { pastEl.insertAdjacentHTML('afterbegin', lineHTML(said)); while (pastEl.children.length > 3) pastEl.lastChild.remove(); }
    said = ev;
    nowEl.className = 'mv-now' + (ev.s >= 0 ? ' s' + ev.s : '') + (ev.hl ? ' hl' : '');
    nowEl.innerHTML = '<span class="mv-now-i">' + icon(EVENT_ICON[ev.k] || 'i-play') + '</span><time>' + clockText(ev.t) + '</time>'
      + '<p>' + (ev.hl ? '<em>' + esc(ev.hl) + '</em>' : '') + rich(ev.txt) + '</p>';
    pop(nowEl);
    react(ev);
  }
  /** De temps en temps, un fan réagit à l'action (fans.js : des messages inventés, de faux comptes). */
  function react(ev) {
    const n = events.indexOf(ev), r = n >= 0 && fans ? fans(ev, n, kda) : null;
    /* une réaction ne reste pas à l'écran quand la partie est passée à autre chose : elle s'efface après quatre actions */
    if (!r) {
      const old = socialEl.firstChild;
      if (old && n - postAt >= 4 && !old.classList.contains('gone')) { old.classList.add('gone'); setTimeout(() => { if (old.parentNode === socialEl) old.remove(); }, 900); }
      return;
    }
    postAt = n;
    socialEl.innerHTML = '<article class="mv-post"><span class="mv-post-a" style="--av:' + r.color + '">' + esc(r.name.charAt(0)) + '</span>'
      + '<div class="mv-post-h"><b>' + esc(r.name) + '</b><i>' + esc(r.handle) + '</i></div><p>' + rich(r.text) + '</p>'
      + '<div class="mv-post-f"><span>' + icon('i-heart') + r.likes + '</span><span>' + icon('i-repost') + r.shares + '</span><em>réaction fictive</em></div></article>';
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
  function strike(kill, slow, from, to) {
    const killer = kill[0], victim = kill[1], side = killer < 5 ? 0 : 1;
    beam(from || pos[killer], to || pos[victim], side, slow);
    setDead(victim, true);
    pop(tokens[victim]);
    sfx.kill();
    if (fx) { const c = clientOf(tokens[victim]); particles.burst(c[0], c[1], { count: slow ? 26 : 10, colors: SIDE_COLORS[side], speed: [50, slow ? 260 : 180], life: [0.35, slow ? 1.1 : 0.7], size: [1.5, 4], gravity: 80 }); }
    if (side === kcSide) cheer(slow ? 1 : 0.7);
    score[side]++;
    kda[killer].k++; kda[victim].d++;
    for (const a of kill[2]) { kda[a].a++; drawKda(a); }
    drawKda(killer); drawKda(victim);
    set('k' + side, score[side]);
  }

  /* ---------- déroulé ---------- */
  /** Un événement, en direct. Les joueurs concernés sont déjà sur place : ils y sont venus à pied, par leur propre chemin. */
  async function show(ev, n) {
    const mine = run, a = plan.at[n], fought = ev.kills.length > 0;
    /* tant qu'on se bat, rien n'annonce l'issue : le repère sur la carte est neutre, et le commentaire ne vient qu'après la dernière élimination */
    ping(plan.anchors[n], fought ? -1 : ev.s);
    if (!fought) { say(ev); cue(ev); }
    await advance(a.tau + SHOW_LEAD);
    const streak = new Map();
    for (let j = 0; j < ev.kills.length; j++) {
      if (stopped(mine)) return;
      strike(ev.kills[j], false);
      const c = (streak.get(ev.kills[j][0]) || 0) + 1;
      streak.set(ev.kills[j][0], c);
      await advance(a.kills[j] + KILL_GAP);
      if (c === 5 && !stopped(mine)) await penta(ev.kills[j][0]);
    }
    if (stopped(mine)) return;
    if (fought) { say(ev); cue(ev); }
    settle(ev);
    await advance(a.end);
  }
  /** Le son d'un événement : une tour qui tombe, un objectif pris. */
  function cue(ev) {
    if (ev.k === 'tower' || ev.k === 'inhib') sfx.tower();
    else if (ev.k === 'baron' || ev.k === 'elder') sfx.objective(true);
    else if (ev.k === 'dragon' || ev.k === 'herald' || ev.k === 'grubs') sfx.objective(false);
  }
  /** Ce qu'un événement change : bâtiments, objectif, tableau de bord. */
  function settle(ev) {
    if (ev.st) structures(ev.st, false);
    /* un objectif, une tour pour la Karmine : sa tribune se fait entendre */
    if (ev.s >= 0 && ev.s === kcSide && EVENT_ICON[ev.k]) cheer(ev.k === 'nexus' ? 2.4 : ev.k === 'baron' || ev.k === 'elder' ? 1.7 : 1);
    pulsePit(ev);
    if (ev.k === 'nexus') explode(ev);
    hud(ev);
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
  /** Un pentakill : la carte s'assombrit, le mot tombe en lettres d'or devant le champion qui vient de les faire tomber tous les cinq. */
  async function penta(K) {
    const p = P[K], box = document.createElement('div');
    box.className = 'mv-penta s' + p.side;
    box.innerHTML = '<i class="mv-penta-rays"></i><span class="mv-penta-art" style="background-image:url(' + DDRAGON + '/img/champion/loading/' + p.champ + '_0.jpg)"></span>'
      + '<div class="mv-penta-text"><span class="mv-penta-pips"><i></i><i></i><i></i><i></i><i></i></span><b>Pentakill</b><em>' + esc(p.name) + '<u>' + esc(p.champName) + '</u></em></div>';
    mapEl.appendChild(box);
    sfx.penta();
    if (p.side === kcSide) cheer(3);
    if (fx) { const r = mapEl.getBoundingClientRect(); particles.burst(r.left + r.width / 2, r.top + r.height * 0.56, { count: 90, colors: GOLD, speed: [120, 620], life: [0.7, 1.8], size: [1.5, 4.5], gravity: 160 }); }
    /* (le temps d'un pentakill ne se presse pas, même en vitesse rapide ; un toucher sur la carte le passe) */
    await nap(2700, null, 1);
    box.classList.add('out');
    setTimeout(() => box.remove(), 450);
  }
  /* ---------- les temps forts, au ralenti ---------- */
  /* De quoi mettre un combat en scène : déplacer un pion, régler sa barre de vie, lancer un projectile, faire éclater un anneau. */
  const sideOf = (i) => (i < 5 ? 0 : 1);
  const put = (i, p) => { tokens[i].style.left = (p[0] / 10).toFixed(2) + '%'; tokens[i].style.top = (p[1] / 10).toFixed(2) + '%'; };
  const again = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };
  function fxNode(cls, p, life) {
    const node = document.createElement('i');
    node.className = cls;
    node.style.left = p[0] / 10 + '%'; node.style.top = p[1] / 10 + '%';
    mapIn.appendChild(node);
    setTimeout(() => node.remove(), life);
    return node;
  }
  /** Un projectile part de « from » et touche « to ». */
  function orb(from, to, side, ms) {
    const node = fxNode('mv-orb s' + side, from, ms + 90);
    node.style.transition = 'left ' + ms + 'ms linear,top ' + ms + 'ms linear';
    requestAnimationFrame(() => requestAnimationFrame(() => { node.style.left = to[0] / 10 + '%'; node.style.top = to[1] / 10 + '%'; }));
  }
  const ring = (p, side, big) => fxNode('mv-ring s' + side + (big ? ' big' : ''), p, big ? 1000 : 750);

  /* Le titre affiché pendant un temps fort : il dit où l'on se bat, jamais qui gagne. */
  const LANE_WORD = { top: 'en haut', mid: 'au milieu', bot: 'en bas' };
  function teaser(ev, n) {
    const z = ev.z, fought = ev.kills.length > 0, before = n ? events[n - 1].dr : [0, 0];
    if (ev.k === 'gank') return 'Embuscade ' + LANE_WORD[z];
    if (ev.k === 'elder') return 'Dragon ancestral';
    if (ev.k === 'dragon') return before[0] === 3 || before[1] === 3 ? 'Dragon de l\'âme' : fought ? 'Combat au dragon' : 'Dragon';
    if (ev.k === 'baron' || z === 'baron') return 'Combat au Baron';
    if (z.slice(0, 4) === 'base' || z.slice(0, 2) === 'tw') return 'Assaut sur la base';
    if (LANE_WORD[z] && ev.kills.length <= 1 && new Set(ev.who).size <= 3) return 'Duel ' + LANE_WORD[z];
    const where = z === 'drake' ? 'au dragon' : z === 'river' ? 'dans la rivière' : LANE_WORD[z] || 'dans la jungle';
    return (ev.kills.length <= 1 ? 'Accrochage ' : 'Combat ') + where;
  }

  /** Un temps fort : l'action ne se joue qu'une fois, au ralenti et en gros plan, et rien n'en annonce l'issue. Les deux camps se jettent
      l'un sur l'autre, les ultimes partent, puis chaque élimination se joue : les assistants touchent la victime (sa vie fond), le tueur
      fond sur elle et l'achève. Le vrai titre de l'action (« Ace », « Le vol »…) et le commentaire ne tombent qu'à la fin. */
  async function feature(ev, n) {
    const mine = run, a = plan.anchors[n], when = plan.at[n], foot = banner.querySelector('.mv-replay-foot'), title = banner.querySelector('b');
    skipSlow = false;
    title.textContent = teaser(ev, n);
    banner.classList.remove('done');
    foot.innerHTML = '<em>Touche pour passer</em>';
    ping(a, -1);
    root.classList.add('slow');
    sfx.slowmo();
    const cast = [...new Set([...plan.casts[n], ...ev.kills.flatMap((k) => [k[0], k[1]])])];
    const here = new Map(cast.map((i) => [i, pos[i].slice()])), fallen = new Set();
    /* la vie de chacun : celle qu'il a en arrivant, puis ce que l'action lui laisse (rien, pour ceux qui y tombent) */
    const lifeOf = new Map(cast.map((i) => [i, plan.hpAt(i, when.tau)])), lifeEnd = new Map(cast.map((i) => [i, plan.hpAt(i, when.hud)]));
    const doomed = new Set(ev.kills.map((k) => k[1])), share = 1 / Math.max(1, ev.kills.length);
    const wear = () => { for (const i of cast) { if (doomed.has(i)) continue; const v = lifeOf.get(i) + (lifeEnd.get(i) - plan.hpAt(i, when.tau)) * share; lifeOf.set(i, v); setHp(i, v); } };
    for (const i of cast) { tokens[i].classList.add('fight'); setHp(i, lifeOf.get(i)); }
    const focus = (p) => {
      const cx = clamp(p[0], 260, 740), cy = clamp(p[1], 260, 740);
      mapIn.style.transform = 'translate(' + (50 - cx / 5).toFixed(2) + '%,' + (50 - cy / 5).toFixed(2) + '%) scale(2)';
    };
    /* fait avancer un pion vers un point, de « d » au plus, en s'arrêtant à la distance « keep » (les pions ne se marchent pas dessus) */
    const step = (i, toward, d, keep) => {
      const p = here.get(i), dx = toward[0] - p[0], dy = toward[1] - p[1], len = Math.hypot(dx, dy) || 1, k = Math.min(d, Math.max(0, len - keep)) / len;
      const q = [p[0] + dx * k, p[1] + dy * k];
      here.set(i, q); put(i, q);
    };
    /* ceux qui lancent leur ultime dans cette action */
    const ulted = new Set(cast.filter((i) => plan.ults[i].used.some(([t]) => t >= when.tau - 400 && t <= when.end)));
    focus(a);
    await nap(620, null, 2);
    if (!stopped(mine) && cast.length > 1) {
      /* les deux camps se jettent l'un sur l'autre : chacun fait un pas vers l'adversaire le plus proche */
      const from = new Map(here);
      for (const i of cast) {
        let foe = null, best = Infinity;
        for (const j of cast) { if (sideOf(j) === sideOf(i)) continue; const d = Math.hypot(from.get(j)[0] - from.get(i)[0], from.get(j)[1] - from.get(i)[1]); if (d < best) { best = d; foe = j; } }
        if (foe !== null) step(i, from.get(foe), 16, 70);
      }
      await nap(260, null, 2);
      /* les ultimes partent, presque ensemble : un anneau éclate autour de chacun de ceux qui lancent le leur */
      for (const i of ulted) {
        if (stopped(mine) || skipSlow) break;
        ring(here.get(i), sideOf(i), true);
        again(tokens[i], 'ulting');
        sfx.ult();
        await nap(120, null, 2);
      }
      if (ulted.size) await nap(260, null, 2);
    }
    const streak = new Map();
    let count = 0;
    for (const kill of ev.kills) {
      if (stopped(mine)) break;
      const K = kill[0], V = kill[1], vp = here.get(V), quick = count >= 4 || skipSlow;
      /* la carte suit l'action, sans quitter le combat des yeux */
      focus([(vp[0] + here.get(K)[0]) / 4 + a[0] / 2, (vp[1] + here.get(K)[1]) / 4 + a[1] / 2]);
      /* ceux qui l'aident touchent d'abord la victime : sa vie fond */
      const hits = kill[2].filter((h) => here.has(h) && !fallen.has(h)).slice(0, 3);
      let life = lifeOf.get(V);
      for (const h of hits) {
        orb(here.get(h), vp, sideOf(h), quick ? 140 : 220);
        await nap(quick ? 100 : 190, null, 2);
        life = Math.max(life * 0.3, life - 0.26);
        setHp(V, life); again(tokens[V], 'hurt');
      }
      if (!hits.length) { setHp(V, life * 0.5); again(tokens[V], 'hurt'); await nap(170, null, 2); }
      /* le tueur fond sur sa cible et l'achève (s'il vient de tomber lui-même, c'est son dernier sort qui s'en charge) */
      if (fallen.has(K)) orb(here.get(K), vp, sideOf(K), quick ? 140 : 220); else step(K, vp, 76, 60);
      await nap(quick ? 150 : 250, null, 2);
      if (stopped(mine)) break;
      setHp(V, 0);
      fallen.add(V);
      wear();
      ring(vp, sideOf(K), false);
      strike(kill, true, here.get(K), vp);
      const c = (streak.get(K) || 0) + 1;
      streak.set(K, c);
      if (c >= 2 && c <= 4) sfx.multi(c);
      /* dans la bande du bas, là où rien ne cache l'action : qui élimine qui */
      foot.innerHTML = '<p class="mv-kill s' + sideOf(K) + '"><img src="' + iconUrl(cat, P[K].champ) + '" alt=""><b>' + esc(P[K].name) + '</b>' + icon('i-play')
        + '<span>' + esc(P[V].name) + '</span><img class="v" src="' + iconUrl(cat, P[V].champ) + '" alt="">'
        /* un coup en série, ou le nom de l'ultime qu'il vient de lancer */
        + (c > 1 ? '<em>' + STREAK[Math.min(5, c)] + '</em>' : ulted.has(K) && P[K].ult ? '<em class="r">' + esc(P[K].ult) + '</em>' : '') + '</p>';
      await nap(quick ? 480 : 820, null, 2);
      /* cinq éliminations pour le même joueur : la partie s'arrête sur son pentakill */
      if (c === 5 && !stopped(mine)) await penta(K);
      count++;
    }
    if (stopped(mine)) { root.classList.remove('slow'); return; }
    /* l'action est jouée : son vrai titre tombe, avec le commentaire et ce qu'elle change (objectif, bâtiments, or) */
    tau = when.hud;
    title.textContent = ev.hl;
    banner.classList.add('done');
    say(ev);
    cue(ev);
    settle(ev);
    await nap(ev.kills.length ? 1150 : 1700, null, 2);
    mapIn.style.transform = 'translate(0%,0%) scale(1)';
    root.classList.remove('slow');
    for (const i of cast) tokens[i].classList.remove('fight', 'ulting', 'hurt');
    /* le direct reprend : chaque pion glisse de là où l'action l'a laissé jusqu'à sa place, et retrouve l'allure que lui donne son trajet */
    for (const i of cast) shown[i] = here.get(i).slice();
    look.fill('?');
    skipSlow = false;
    await advance(when.end);
  }
  function reset() {
    run++;
    skipped = false; paused = false; skipSlow = false;
    lost = [[0, 0, 0, 0], [0, 0, 0, 0]];
    built.forEach((node) => node.classList.remove('down'));
    root.querySelectorAll('.mv-penta').forEach((node) => node.remove());
    score[0] = 0; score[1] = 0;
    setClock(0);
    tau = 0;
    cursor.fill(0); look.fill('?'); campLook.fill('?'); csLook.fill(-1); ultLook.fill(null); lvLook.fill(0); hpLook.fill(-1); mpLook.fill(-1); sumLook.forEach((l) => l.fill(-1));
    P.forEach((p, i) => { kda[i] = { k: 0, d: 0, a: 0 }; setDead(i, false); drawKda(i); tokens[i].classList.remove('fight', 'ulting', 'hurt'); });
    banner.classList.remove('done');
    draw(true);
    said = null; pastEl.innerHTML = ''; socialEl.innerHTML = ''; postAt = -1;
    /* les réactions des fans repartent du début : les mêmes, aux mêmes moments, quand on revoit la partie */
    fans = createFans({ P, teams: M.teams, sim });
    say({ t: 0, k: 'start', s: -1, kills: [], txt: 'Bienvenue sur la Faille de l\'invocateur : ' + M.teams[0].name + ' contre ' + M.teams[1].name + '.' });
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
    tau = plan.total;
    look.fill('?');
    draw(true);
  }
  async function playGame() {
    if (playing) return;
    playing = true;
    reset();
    stage('game');
    const mine = run;
    for (let n = 0; n < events.length && !stopped(mine); n++) {
      /* le temps passe jusqu'au prochain événement */
      await advance(plan.at[n].tau);
      if (stopped(mine)) break;
      setClock(events[n].t);
      /* un temps fort se joue une seule fois, au ralenti et sans en annoncer l'issue ; le reste, en direct */
      if (events[n].hl && fx) await feature(events[n], n); else await show(events[n], n);
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
      /* le farm de la partie, et par minute comme sur le tableau des scores du jeu */
      const cs = csAt(i, sim.duration, plan.total);
      return '<tr' + (i === sim.mvp ? ' class="mvp"' : '') + '><td><img src="' + iconUrl(cat, p.champ) + '" alt="" loading="lazy"></td><td><b>' + esc(p.name) + (i === sim.mvp ? ' <em>MVP</em>' : '') + '</b><i>' + ROLE_LABEL[p.role] + ' · ' + esc(p.champName) + '</i></td>'
        + '<td class="num">' + s.k + '</td><td class="num">' + s.d + '</td><td class="num">' + s.a + '</td><td class="num cs">' + cs + '<i>' + (cs / (sim.duration / 60)).toFixed(1).replace('.', ',') + ' / min</i></td></tr>';
    };
    const board = (s) => '<table class="sb s' + s + '"><thead><tr><th colspan="2">' + esc(M.teams[s].name) + (s === w ? ' <em>vainqueur</em>' : '') + '</th><th class="num">K</th><th class="num">D</th><th class="num">A</th><th class="num">CS</th></tr></thead>'
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
    if (rewards.html) prize = rewards.html;
    else if (rewards.replay) prize = '<div class="prize"><span>Rediffusion</span><b>' + (won ? 'Victoire' : 'Défaite') + '</b><i>Les récompenses ont déjà été versées.</i></div>';
    else {
      prize = '<div class="prize"><span>' + (won ? 'Récompense' : 'Lot de consolation') + '</span><b>+' + rewards.coins + ' crédits</b>'
        + (rewards.easy ? '<i>Adversaire bien plus faible : gain réduit.</i>' : '') + '</div>'
        + (rewards.pack ? '<div class="prize bonus"><span>Première victoire contre ' + esc(foeTeam ? foeTeam.name : M.opp) + '</span><b>+1 pack</b><i>Il t\'attend dans l\'onglet Packs.</i></div>' : '');
    }
    endEl.innerHTML = '<div class="end-box panel ' + (won ? 'win' : 'lose') + '"><div class="end-title' + (rewards.title && rewards.title.length > 9 ? ' long' : '') + '">' + esc(rewards.title || (won ? 'Victoire' : 'Défaite')) + '</div>'
      + '<div class="end-score"><span class="s0">' + esc(short(0)) + '</span><b>' + sim.kills[0] + ' – ' + sim.kills[1] + '</b><span class="s1">' + esc(short(1)) + '</span></div>'
      + '<p class="end-sub">' + (rewards.sub ? '<b>' + esc(rewards.sub) + '</b> · ' : '') + clockText(sim.duration) + ' de jeu · côté ' + (you === 0 ? 'bleu' : 'rouge') + '</p>'
      + '<div class="end-top"><div class="end-mvp">' + (mvp.card ? cardHTML(mvp.card, cat, { eager: true }) : '<img class="end-mvp-i" src="' + iconUrl(cat, mvp.champ) + '" alt="">')
      + '<div><span>MVP de la partie</span><b>' + esc(mvp.name) + '</b><i>' + ms.k + ' / ' + ms.d + ' / ' + ms.a + ' sur ' + esc(mvp.champName) + '</i></div></div>'
      + '<div class="end-side">' + prize
      + '<table class="end-stats"><thead><tr><td class="num s0">' + esc(short(0)) + '</td><th></th><td class="num s1">' + esc(short(1)) + '</td></tr></thead><tbody>'
      + line('Éliminations', sim.kills[0], sim.kills[1]) + line('Or', kilo(sim.gold[0]), kilo(sim.gold[1])) + line('Tours', sim.towers[0], sim.towers[1])
      + line('Dragons', sim.dragons[0], sim.dragons[1]) + line('Barons', sim.barons[0], sim.barons[1]) + '</tbody></table></div></div>'
      + '<div class="end-actions actions"><button class="btn primary big" type="button" data-go="' + (rewards.pack ? 'packs' : 'jouer') + '">' + (rewards.pack ? 'Ouvrir mon pack' : esc(rewards.next || 'Continuer')) + '</button>'
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
      if (what === 'sound') toggleVolume(a, drawCtrl);
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
    closeVolume();
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
