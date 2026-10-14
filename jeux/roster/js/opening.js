/* L'ouverture d'un sachet, comme on ouvre un vrai paquet.
   1. Le sachet quitte l'accueil et vient au centre de l'écran.
   2. Le joueur déchire la bande du haut : en glissant le doigt d'une encoche à l'autre, ou d'un simple toucher.
   3. Le sachet bâille, les cinq cartes en sortent d'un bloc, de dos ; le sachet tombe, le paquet vient au centre.
      S'il contient une très belle carte, une lueur s'échappe du sachet dès qu'il s'ouvre : on sait qu'il y a quelque chose, pas quoi.
   4. Il découvre les cartes une à une : celle du dessus quitte le paquet, de dos, et revient se poser en se retournant ; elle va ensuite
      se ranger sur le présentoir du bas. Une belle carte brille avant même qu'on la touche. Une All-Pro se fait attendre : la lumière
      baisse, son pays, son poste et sa ligue s'annoncent, puis elle se retourne. Une carte très rare (MVP, légendaire, édition limitée…)
      prend tout son temps : le noir se fait, un cœur bat, les indices tombent un à un, et elle se retourne lentement.
   5. Bilan : les cinq cartes côte à côte. Un doublon peut se revendre aussitôt ; une carte se touche pour l'examiner sous toutes ses faces.
   Le serveur a déjà tout décidé quand l'animation commence : ici, on ne fait que mettre en scène. */
import { LEGEND_SONGS, ROLE_LABEL, TIER_COLOR } from './config.js';
import { VARIANTS, cardHTML, esc, flagUrl, photoUrl, tiltCard, variantRank } from './cards.js';
import { createFx } from './fx.js';
import { inspectCard } from './inspect.js';
import { TEAR_Y, packBackHTML, packSplitHTML, shapeBack, shapeBody, tearPoints } from './pack.js';
import { musicScale } from './music.js';
import { sfx, soundOn } from './sound.js';
import { closeVolume, toggleVolume } from './volume.js';

export { packHTML } from './pack.js';

/* le lecteur de YouTube, dans sa version sans cookies de suivi */
const YT = 'https://www.youtube-nocookie.com';
const PRISM = ['#ffe7a8', '#9fe8ff', '#ffffff'];
const RAINBOW = ['#ff9cc6', '#ffd88a', '#a8ffdc', '#9ccfff', '#d3b4ff', '#ffffff'];
const KC_BLUE = ['#39b8ff', '#ffffff', '#0b47ff', '#9be7ff'];
/* (l'édition légendaire : or, or pâle et rouge sang, comme la carte) */
const DIAMOND = ['#fff8e2', '#ffd98a', '#e0344e', '#f0cf7c'];
const CEO_GOLD = ['#ffd978', '#fff6d6', '#39b8ff', '#f0cd72'];
const SIGN_GOLD = ['#fff6cf', '#f3dc9a', '#ffffff', '#c79a3e'];
const dustOf = (card) => (card.edition === 'ceo' && !card.variant ? CEO_GOLD : card.variant === 'sign' ? SIGN_GOLD : card.variant === 'legend' ? DIAMOND : card.variant === 'kc' ? KC_BLUE : card.variant === 'holo' ? RAINBOW
  : card.tier === 5 ? PRISM : [TIER_COLOR[card.tier], '#ffffff', '#f0e6d2']);
/* l'éclat d'une carte, de 1 à 5 : son rang, relevé d'un cran pour une holographique et de deux pour une full art ; le plus fort pour une édition limitée */
const shineOf = (card) => (card.limited ? 5 : Math.min(5, card.tier + variantRank(card)));
/* pour examiner l'animation image par image, les essais peuvent tout ralentir : window.__lent = 4 */
const slow = () => (typeof window !== 'undefined' && window.__lent) || 1;
const wait = (ms) => new Promise((r) => setTimeout(r, ms * slow()));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const buzz = (pattern) => { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* pas de vibreur */ } };
const icon = (id) => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + id + '"/></svg>';
/* allures des mouvements : t va de 0 à 1 */
const EASE = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  /* ressorts : la cible est un peu dépassée, puis l'objet s'y pose */
  spring: (t) => 1 - Math.exp(-6.5 * t) * Math.cos(7.5 * t),
  soft: (t) => 1 - Math.exp(-5.2 * t) * Math.cos(4.4 * t),
};
/* une pose : position en pixels depuis le centre de la scène, rotation, échelle */
const tf = (p) => 'translate3d(' + p.x.toFixed(2) + 'px,' + p.y.toFixed(2) + 'px,0) rotate(' + p.r.toFixed(3) + 'deg) scale(' + p.s.toFixed(4) + ')';

function preload(url) {
  return new Promise((resolve) => {
    if (!url) return resolve();
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = url;
  });
}

/** Joue l'ouverture. request() appelle le serveur ; renvoie { data, goTo } une fois le bilan fermé.
    getCat() donne le catalogue : il est relu après la réponse du serveur, au cas où il viendrait d'être mis à jour.
    from : le sachet de l'accueil, d'où part celui de l'ouverture ; look : ses couleurs et son illustration ({ kind, art }).
    quick : la revente d'un doublon au bilan, si le serveur la propose — { price(carte) : ce qu'elle rapporte, sell(carte) : la vend et
    renvoie { coins, left } (crédits gagnés, exemplaires restants) ou null si la vente est refusée }.
    Si le serveur refuse l'ouverture, l'écran se referme et l'erreur est relancée telle quelle. */
export async function runOpening({ request, getCat, fx, size, from, look, quick }) {
  let cat = getCat();
  const op = document.createElement('div');
  op.className = 'op';
  op.dataset.stage = 'enter';
  op.innerHTML = '<canvas class="op-fx"></canvas>'
    + '<header class="op-head"><h2>Ouverture du pack</h2><span class="spacer"></span>'
    + '<button class="op-icon" type="button" data-act="sound" aria-haspopup="dialog" aria-label="Régler le son"></button>'
    + '<button class="btn" type="button" data-act="skip">Passer</button></header>'
    + '<div class="op-stage"><div class="op-tray" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>'
    + '<div class="op-item op-back">' + packBackHTML(look) + '</div>'
    + '<div class="op-item op-front">' + packSplitHTML(cat.season, size, look) + '</div>'
    + '<div class="op-dim"></div><div class="op-spot"></div><div class="op-rays"></div><div class="op-bloom"></div><div class="op-ring"></div><div class="op-flash"></div>'
    + '<div class="op-clues"></div><div class="op-label"></div></div>'
    + '<footer class="op-foot"><p class="op-info" aria-live="polite"></p><div class="actions">'
    + '<button class="btn primary big" type="button" data-go="">Continuer</button><button class="btn big" type="button" data-go="collection">Ma collection</button></div></footer>';
  const $ = (sel) => op.querySelector(sel);
  const stage = $('.op-stage'), front = $('.op-front'), back = $('.op-back'), info = $('.op-info'), clues = $('.op-clues'), label = $('.op-label'), bloom = $('.op-bloom');
  const ring = $('.op-ring'), flashEl = $('.op-flash');
  op.dataset.kind = (look && look.kind) || 'free';
  const rig = $('.op-front .pk-rig'), packEl = $('.op-front .pack'), tearBox = $('.pk-tearbox'), torn = $('.pk-torn'), body = $('.pk-body'), inner = $('.pk-inner');
  const hold = $('.pk-win.hold'), gone = $('.pk-win.gone'), fib = $('.pk-win.fib'), fiberLine = $('.pk-fiber.body polyline');
  const scroll = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(op);
  const particles = createFx($('.op-fx'));
  const soundBtn = $('[data-act="sound"]');
  const drawSound = () => { soundBtn.innerHTML = icon(soundOn() ? 'i-sound' : 'i-mute'); soundBtn.classList.toggle('off', !soundOn()); };
  drawSound();

  /* ---------- la scène : tailles et poses ---------- */
  const M = {};
  function layout() {
    const r = stage.getBoundingClientRect();
    M.w = r.width; M.h = r.height; M.x = r.left + r.width / 2; M.y = r.top + r.height / 2;
    M.narrow = M.w < 700;
    op.classList.toggle('narrow', M.narrow);
    /* le présentoir du bas, la carte en grand, le sachet, puis les cartes du bilan */
    M.tw = Math.min(M.w * 0.15, 86); M.th = M.tw * 1.4; M.tg = Math.min(M.w * 0.022, 14);
    const gap = M.narrow ? 24 : 30;
    M.cw = Math.max(120, Math.min(M.w * 0.7, 330, (M.h - M.th - gap - 30) / 1.4)); M.ch = M.cw * 1.4;
    M.heroY = -(M.ch + gap + M.th) / 2 + M.ch / 2;
    M.trayY = (M.ch + gap + M.th) / 2 - M.th / 2;
    M.pw = Math.max(120, Math.min(M.w * 0.6, 300, (M.h - 40) / 1.52)); M.ph = M.pw * 1.52;
    M.is = (0.86 * M.pw) / M.cw;                       // échelle d'une carte quand elle est dans le sachet
    /* hauteur de l'éventail des cartes sorties : aux deux tiers hors du sachet, mais jamais hors de l'écran */
    const fanH = M.ch * M.is, ideal = -M.ph / 2 - 0.12 * fanH;
    M.fanY = Math.max(ideal, -M.h / 2 + fanH / 2 + 30);
    M.drop = M.fanY - ideal + M.ph * 0.06;             // ce dont le sachet descend pendant que les cartes sortent
    if (M.narrow) { M.gw = Math.min((M.w - 36) / 3, 150); M.gg = 10; } else { M.gw = Math.min((M.w - 4 * 22 - 48) / 5, 200); M.gg = 22; }
    M.gh = M.gw * 1.4;
    const vars = { cw: M.cw, ch: M.ch, opw: M.pw, tw: M.tw, tg: M.tg, trayY: M.trayY, heroY: M.heroY };
    for (const k of Object.keys(vars)) op.style.setProperty('--' + k, vars[k].toFixed(2) + 'px');
  }
  const POSE = {
    pack: () => ({ x: 0, y: 0, s: 1, r: 0 }),
    /* dans le sachet, juste sous la déchirure */
    inside: (i) => ({ x: 0, y: -M.ph / 2 + (TEAR_Y / 100 + 0.018) * M.ph + (M.ch * M.is) / 2 + i * 0.7, s: M.is, r: 0 }),
    /* sorties aux deux tiers, d'un seul bloc à peine décalé : on devine la tranche de chacune, comme un paquet qu'on tire du sachet */
    fan: (i) => ({ x: (i - 2) * M.cw * M.is * 0.014, y: M.fanY + i * M.ch * M.is * 0.007, s: M.is, r: -2.2 + i * 0.55 }),
    /* la carte du dessus, prise à la main : elle s'écarte du paquet avant de se retourner */
    peel: () => ({ x: Math.min(M.cw * 0.6, M.w / 2 - M.cw * 0.42), y: M.heroY - M.ch * 0.05, s: 1.02, r: 7 }),
    /* le paquet au centre : d = 0 pour la carte du dessus */
    stack: (d) => ({ x: d * M.cw * 0.004, y: M.heroY + d * M.cw * 0.017, s: 1 - d * 0.012, r: [0, -1.3, 1, -0.7, 1.4][d] || 0 }),
    lifted: () => ({ x: 0, y: M.heroY - M.ch * 0.03, s: 1.045, r: 0 }),
    tray: (k) => ({ x: (k - 2) * (M.tw + M.tg), y: M.trayY, s: M.tw / M.cw, r: 0 }),
    grid: (k) => (M.narrow
      ? { x: (k < 3 ? k - 1 : k - 3.5) * (M.gw + M.gg), y: (k < 3 ? -1 : 1) * (M.gh / 2 + 21) - 12, s: M.gw / M.cw, r: 0 }
      : { x: (k - 2) * (M.gw + M.gg), y: 0, s: M.gw / M.cw, r: 0 }),
    zoom: () => ({ x: 0, y: 0, s: Math.min(1.05, (M.h - 24) / M.ch), r: 0 }),
  };
  const poses = new Map();     // où chaque objet se trouve (ou vers quoi il va)
  const where = new Map();     // et ce que cette pose représente, pour la recalculer si l'écran change de taille
  function snap(el, pose) {
    poses.set(el, pose);
    el.style.setProperty('--s', pose.s.toFixed(4));
    el.style.transform = tf(pose);
  }
  /* la pose qu'on voit à l'instant, pour un objet en plein mouvement */
  function seenPose(el) {
    const m = getComputedStyle(el).transform.match(/matrix\(([^)]+)\)/);
    if (!m) return poses.get(el);
    const v = m[1].split(',').map(Number);
    return { x: v[4], y: v[5], s: Math.hypot(v[0], v[1]), r: (Math.atan2(v[1], v[0]) * 180) / Math.PI };
  }
  /** Déplace un objet vers une pose. ease : allure ; arc : hauteur de la courbe du trajet, en pixels. */
  function move(el, to, { dur = 500, ease = EASE.out, delay = 0, arc = 0 } = {}) {
    const moving = fx ? el.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getKeyframes().some((f) => 'transform' in f)) : [];
    const from = (moving.length ? seenPose(el) : poses.get(el)) || to;
    moving.forEach((a) => a.cancel());
    poses.set(el, to);
    if (!fx) { el.style.setProperty('--s', to.s.toFixed(4)); el.style.transform = tf(to); return Promise.resolve(); }
    /* une image clé par image affichée : le mouvement suit exactement l'allure demandée */
    const n = Math.max(10, Math.round(dur / 16)), frames = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, k = ease(t);
      frames.push({ transform: tf({ x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) - arc * Math.sin(Math.PI * t), s: lerp(from.s, to.s, k), r: lerp(from.r, to.r, k) }) });
    }
    const a = el.animate(frames, { duration: dur * slow(), delay: delay * slow(), easing: 'linear', fill: 'both' });
    return a.finished.then(() => { el.style.setProperty('--s', to.s.toFixed(4)); el.style.transform = tf(to); a.cancel(); }).catch(() => { /* mouvement remplacé par un autre */ });
  }
  function place(el, kind, arg, opts) {
    where.set(el, [kind, arg]);
    return move(el, POSE[kind](arg), opts);
  }
  /** Anime une valeur de 0 à 1 image par image (pour ce qui ne se réduit pas à un déplacement). */
  function run(dur, fn) {
    if (!fx) { fn(1); return Promise.resolve(); }
    return new Promise((resolve) => {
      const t0 = performance.now(), mine = gen;
      const step = (now) => {
        if (mine !== gen) return resolve();
        const t = clamp((now - t0) / (dur * slow()), 0, 1);
        fn(t);
        if (t < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------- état ---------- */
  let data = null, pulls = [], boxes = [], imgs = [], ready = false;
  let k = 0, shown = false, busy = true, goTo = null, leave = null, closed = false;
  let gen = 0;                 // change quand le joueur passe l'animation : ce qui était en cours s'arrête
  let bulk = [];               // les doublons ordinaires du bilan, que le bouton unique du téléphone revend d'un coup
  let hints = 2;               // nombre de fois où l'on rappelle « touche pour continuer »
  let tearP = 0, tearDir = 1, drag = null;   // part de la bande déjà déchirée (0 à 1), sens du geste, geste en cours
  const setStage = (name) => { op.dataset.stage = name; };
  const setInfo = (html, pulse) => { info.innerHTML = html; info.classList.toggle('pulse', !!pulse); };
  /* la lumière de la scène prend la couleur de la carte */
  const setBeam = (card) => {
    op.style.setProperty('--beam', card.limited && !card.variant ? '#ffd978' : card.variant === 'sign' ? '#f3dc9a' : card.variant === 'legend' ? '#ffcf7a' : card.variant === 'kc' ? '#39b8ff' : card.tier >= 3 ? TIER_COLOR[card.tier] : '#c8aa6e');
    op.dataset.tier = card.tier; op.dataset.variant = card.variant || '';
  };
  let untilt = null, omenTimer = 0, endApo = null, song = null;
  const cardEl = (i) => boxes[i].querySelector('.card');
  /* une belle carte brille avant même d'être retournée : son dos s'illumine, quelques éclats montent autour d'elle.
     On sait qu'elle vaut le coup d'œil — pas qui elle est. */
  function omen(i) {
    clearInterval(omenTimer);
    boxes.forEach((b) => b.classList.remove('omen', 'omen5'));
    if (i === null || i >= pulls.length || !fx) return;
    const tier = shineOf(pulls[i].card);
    if (tier < 4) return;
    setBeam(pulls[i].card);
    boxes[i].classList.add('omen');
    if (tier >= 5) boxes[i].classList.add('omen5');
    const sparkle = () => {
      if (closed || !boxes[i].classList.contains('omen')) return;
      const c = clientOf(poses.get(boxes[i]) || POSE.stack(0));
      particles.burst(c[0] + (Math.random() - 0.5) * M.cw * 0.9, c[1] + M.ch * (0.1 + Math.random() * 0.35), { count: tier >= 5 ? 4 : 2, colors: dustOf(pulls[i].card), shapes: ['dot'], speed: [20, 70], life: [0.9, 1.7], size: [1, 2.2], gravity: -46, spread: 0.9, angle: -Math.PI / 2, drag: 0.97 });
    };
    sparkle();
    omenTimer = setInterval(sparkle, tier >= 5 ? 300 : 460);
  }
  const clientOf = (pose) => [M.x + pose.x, M.y + pose.y];

  function close() {
    closed = true;
    closeVolume();
    gen++;
    clearInterval(omenTimer);
    if (endApo) endApo();
    stopSong(true);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    particles.destroy();
    op.remove();
    document.body.style.overflow = scroll;
    if (from) from.style.visibility = '';
  }
  function onResize() {
    layout();
    if (front.isConnected && op.dataset.stage !== 'stack' && op.dataset.stage !== 'done') { snap(front, POSE.pack()); snap(back, POSE.pack()); setTear(tearP); }
    boxes.forEach((b) => { const w = where.get(b); if (w) snap(b, POSE[w[0]](w[1])); });
  }

  /* ---------- 1. le sachet arrive pendant que le serveur tire les cartes ---------- */
  layout();
  snap(back, POSE.pack());
  if (from && fx) {
    const r = from.getBoundingClientRect();
    snap(front, { x: r.left + r.width / 2 - M.x, y: r.top + r.height / 2 - M.y, s: r.width / M.pw, r: 0 });
    from.style.visibility = 'hidden';
  } else {
    snap(front, POSE.pack());
  }
  const entered = fx ? move(front, POSE.pack(), { dur: 720, ease: EASE.soft }) : Promise.resolve();
  window.addEventListener('resize', onResize);
  try {
    [data] = await Promise.all([request(), entered]);
  } catch (e) {
    close();
    throw e;
  }
  cat = getCat();
  pulls = data.pack.cards.map((p) => ({ qty: p.qty, isNew: p.isNew, serial: p.serial || 0, card: cat.cardById.get(p.id) })).filter((p) => p.card);
  const serials = new Map(pulls.filter((p) => p.serial).map((p) => [p.card.id, p.serial]));
  if (!pulls.length) { close(); throw new Error('sachet vide : cartes inconnues du catalogue'); }
  imgs = pulls.map((p) => preload(photoUrl(p.card)));
  const best = pulls.reduce((a, p) => (shineOf(p.card) > shineOf(a) ? p.card : a), pulls[0].card);
  /* les cartes attendent dans le sachet, face cachée : la première sur le dessus */
  boxes = pulls.map((p, i) => {
    const b = document.createElement('div');
    b.className = 'op-item op-cardbox t' + p.card.tier + (p.card.variant ? ' v-' + p.card.variant : '');
    b.dataset.i = i;
    b.style.zIndex = 10 - i;
    b.innerHTML = cardHTML(p.card, cat, { back: true, eager: true, cls: 'is-back', serial: p.serial }) + '<i class="op-sheen"></i>'
      + '<span class="op-tag' + (p.isNew ? ' new' : '') + '">' + (p.isNew ? 'Nouvelle' : '×' + p.qty) + '</span>';
    stage.insertBefore(b, front);
    where.set(b, ['inside', i]);
    snap(b, POSE.inside(i));
    return b;
  });

  document.addEventListener('keydown', onKey);
  op.addEventListener('click', onClick);
  op.addEventListener('pointermove', onMove);
  front.addEventListener('pointerdown', onDown);
  front.addEventListener('pointerup', onUp);
  front.addEventListener('pointercancel', onUp);

  let floating = null;
  if (!fx) {
    /* animations coupées : on montre tout de suite le contenu du sachet */
    front.remove(); back.remove();
    boxes.forEach((b, i) => { cardEl(i).classList.remove('is-back'); b.classList.add('in', 'out', 'lit'); where.set(b, ['grid', i]); snap(b, POSE.grid(i)); });
    k = pulls.length;
    finish();
  } else {
    /* ---------- 2. le sachet attend qu'on le déchire ---------- */
    setStage('sealed');
    ready = true;
    busy = false;
    setInfo(matchMedia('(pointer: coarse)').matches ? 'Glisse le doigt sur le haut du pack, ou touche-le, pour le déchirer' : 'Glisse sur le haut du pack, ou clique dessus, pour le déchirer', true);
    floating = packEl.animate([{ transform: 'translateY(0) rotate(-.5deg)' }, { transform: 'translateY(-8px) rotate(.5deg)' }],
      { duration: 2600, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
  }

  await new Promise((resolve) => { leave = resolve; });
  close();
  return { data, goTo };

  /* ---------- la déchirure ---------- */
  /* La partie déchirée se soulève en tournant autour du point où le papier tient encore. */
  function tornTf(x, ty, angle, dx, dy) {
    return 'translate(' + (x + dx).toFixed(2) + 'px,' + (ty + dy).toFixed(2) + 'px) rotate(' + angle.toFixed(2) + 'deg) translate(' + (-x).toFixed(2) + 'px,' + (-ty).toFixed(2) + 'px)';
  }
  function setTear(p) {
    tearP = p;
    const x = p * M.pw, ty = (TEAR_Y / 100) * M.ph;
    hold.style.transform = 'translateX(' + x.toFixed(2) + 'px)';
    hold.firstChild.style.transform = 'translateX(' + (-x).toFixed(2) + 'px)';
    for (const w of [gone, fib]) {
      w.style.transform = 'translateX(' + (x - M.pw).toFixed(2) + 'px)';
      w.firstChild.style.transform = 'translateX(' + (M.pw - x).toFixed(2) + 'px)';
    }
    torn.style.transform = tornTf(x, ty, p ? 4 + 17 * EASE.out(p) : 0, 0, p ? -2 * p : 0);
  }
  function tilt(e) {
    const r = front.getBoundingClientRect();
    const u = clamp((e.clientX - r.left) / r.width, -0.4, 1.4), v = clamp((e.clientY - r.top) / r.height, -0.3, 1.3);
    rig.style.setProperty('--ry', ((u - 0.5) * 15).toFixed(2) + 'deg');
    rig.style.setProperty('--rx', ((0.5 - v) * 10).toFixed(2) + 'deg');
    rig.style.setProperty('--gx', (132 - u * 160).toFixed(1) + '%');
  }
  function onMove(e) {
    if (op.dataset.stage !== 'sealed') return;
    if (e.pointerType === 'mouse' || drag) tilt(e);
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    if (!drag.moved && Math.abs(dx) > 8) {
      drag.moved = true;
      /* le sens est celui du premier geste ; la bande et sa déchirure sont symétriques, on les retourne pour déchirer de droite à gauche */
      if (tearP === 0) { tearDir = dx > 0 ? 1 : -1; tearBox.style.transform = tearDir < 0 ? 'scaleX(-1)' : ''; }
      drag.x0 = e.clientX;
      return;
    }
    if (!drag.moved) return;
    packEl.classList.add('torn');
    const p = clamp(drag.p0 + (dx * tearDir) / (M.pw * 0.8), 0, 1);
    if (p <= tearP) return;
    /* le bruit du papier suit le doigt */
    if (e.timeStamp - drag.tick > 26) {
      sfx.tearGrain(clamp(((p - tearP) * M.pw) / Math.max(1, e.timeStamp - drag.tick) / 1.2, 0, 1));
      drag.tick = e.timeStamp;
      if (Math.floor(p * 9) !== Math.floor(tearP * 9)) buzz(6);
    }
    setTear(p);
    if (p >= 1) { drag = null; front.classList.remove('held'); torn_(); }
  }
  function onDown(e) {
    if (op.dataset.stage !== 'sealed' || !ready || drag) return;
    drag = { id: e.pointerId, x0: e.clientX, p0: tearP, moved: false, tick: e.timeStamp };
    try { front.setPointerCapture(e.pointerId); } catch (err) { /* pas grave */ }
    front.classList.add('held');
    tilt(e);
    sfx.crinkle();
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    front.classList.remove('held');
    if (op.dataset.stage !== 'sealed') return;
    /* un simple toucher, ou une déchirure bien entamée : le sachet finit de s'ouvrir tout seul */
    if (!d.moved || tearP >= 0.4) finishTear();
  }
  async function finishTear() {
    if (op.dataset.stage !== 'sealed') return;
    packEl.classList.add('torn');
    setStage('tearing');
    const mine = gen, from0 = tearP, dur = 120 + 360 * (1 - from0);
    sfx.tear(dur / 1000, from0);
    buzz([8, 30, 8, 30, 8]);
    await run(dur, (t) => setTear(lerp(from0, 1, EASE.inOut(t))));
    if (mine !== gen) return;
    torn_();
  }

  /* ---------- 3. la bande s'envole, le sachet bâille, les cartes sortent ---------- */
  async function torn_() {
    const mine = gen;
    setStage('opening');
    busy = true;
    setInfo('', false);
    if (floating) {
      const cur = getComputedStyle(packEl).transform;
      floating.cancel();
      packEl.animate([{ transform: cur }, { transform: 'none' }], { duration: 280, easing: 'ease-out' });
    }
    for (const v of ['--rx', '--ry']) rig.style.setProperty(v, '0deg');
    sfx.snap();
    buzz(18);
    /* quelques miettes de papier tombent de la déchirure */
    const top = clientOf({ x: 0, y: -M.ph / 2 + (TEAR_Y / 100) * M.ph });
    particles.burst(top[0] + tearDir * M.pw * 0.3, top[1], { count: 9, colors: ['#f2f5f7', '#c8aa6e', '#dfe6ec'], shapes: ['dot'], speed: [20, 110], life: [0.5, 1.1], size: [1.2, 2.6], gravity: 520, spread: 2.4, angle: -Math.PI / 2, drag: 0.97 });
    /* la bande part vers le haut, du côté où on l'a tirée, puis retombe */
    const ty = (TEAR_Y / 100) * M.ph, a0 = 21;
    run(760, (t) => {
      torn.style.transform = tornTf(M.pw, ty, a0 + 62 * EASE.out(t), 34 * t, -96 * t + 470 * t * t);
      torn.style.opacity = String(clamp(1 - (t - 0.5) / 0.4, 0, 1));
    });
    /* la bouche s'ouvre : le devant se creuse, le fond remonte, les cartes apparaissent dans l'ouverture */
    back.classList.add('in');
    boxes.forEach((b) => b.classList.add('in'));
    await run(260, (t) => {
      const b = 2.7 * EASE.out(t), front_ = shapeBody(b), back_ = shapeBack(b * 0.55);
      body.style.clipPath = front_; body.style.webkitClipPath = front_;
      inner.style.clipPath = back_; inner.style.webkitClipPath = back_;
      fiberLine.setAttribute('points', tearPoints(b));
    });
    if (mine !== gen) return;
    /* une très belle carte dans le sachet : une lueur s'en échappe, à sa couleur, et quelques éclats montent de la bouche */
    const hit = shineOf(best);
    if (hit >= 4) {
      setBeam(best);
      op.classList.add('glow');
      if (hit >= 5) op.classList.add('glow5');
      sfx.shimmer(hit);
      buzz(hit >= 5 ? [14, 50, 14, 50, 40] : [12, 60, 24]);
      particles.burst(top[0], top[1] + M.ph * 0.02, { count: hit >= 5 ? 34 : 18, colors: dustOf(best), shapes: ['dot'], speed: [60, 300], life: [0.8, 1.8], size: [1, 2.8], gravity: -30, spread: 1.5, angle: -Math.PI / 2, drag: 0.96 });
      await wait(hit >= 5 ? 620 : 380);
      if (mine !== gen) return;
    } else await wait(70);
    if (mine !== gen) return;
    /* les cartes montent d'un seul bloc, celle du dessus en tête ; le sachet recule un peu sous l'effort, puis tombe */
    sfx.slideOut();
    const risen = Promise.all(boxes.map((b, i) => place(b, 'fan', i, { dur: 860, ease: EASE.out, delay: i * 30 })));
    for (const el of [front, back]) move(el, { x: 0, y: M.drop, s: 1, r: 0 }, { dur: 700, ease: EASE.inOut });
    await wait(540);
    if (mine !== gen) return;
    op.classList.remove('glow', 'glow5');
    boxes.forEach((b) => b.classList.add('out'));
    for (const el of [front, back]) {
      move(el, { x: -tearDir * M.pw * 0.12, y: M.h * 0.5 + M.ph * 0.7, s: 0.96, r: -tearDir * 7 }, { dur: 620, ease: EASE.in });
      el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], { duration: 620 * slow(), fill: 'forwards' });
    }
    await risen;
    await wait(160);
    if (mine !== gen) return;
    /* le paquet vient se poser au centre, en grand */
    sfx.whoosh();
    await Promise.all(boxes.map((b, i) => place(b, 'stack', i, { dur: 820, ease: EASE.soft, delay: i * 22, arc: M.ch * 0.03 })));
    if (mine !== gen) return;
    front.remove(); back.remove();
    setBeam(best);
    setStage('stack');
    setInfo('Touche le paquet pour retourner la première carte', true);
    omen(0);
    busy = false;
  }

  /* ---------- 4. les cartes, une à une ---------- */
  /** Le toucher du joueur : retourne la carte du dessus, ou la range et retourne la suivante. */
  function advance() {
    if (busy || op.dataset.stage !== 'stack') return;
    if (!shown) flip(k); else next();
  }
  async function flip(i) {
    const mine = gen, box = boxes[i], el = cardEl(i), p = pulls[i], card = p.card, tier = shineOf(card);
    busy = true;
    setInfo('', false);
    setBeam(card);
    /* la photo du joueur doit être là avant que la carte se montre */
    await Promise.race([imgs[i], wait(700)]);
    if (mine !== gen) return;
    if (tier >= 4) await prelude(i, tier);
    if (mine !== gen) return;
    clearInterval(omenTimer);
    box.style.zIndex = tier >= 4 ? 30 : 16;
    /* la carte quitte le dessus du paquet, de dos… */
    sfx.slide();
    await move(box, POSE.peel(), { dur: tier >= 5 ? 620 : tier >= 4 ? 420 : 250, ease: EASE.inOut, arc: M.ch * 0.035 });
    if (mine !== gen) return;
    if (tier >= 5) {
      /* …une très rare reste un instant en suspens : un dernier battement, un éclair */
      sfx.heart(); buzz([40, 60, 60]);
      await wait(520);
      if (mine !== gen) return;
      flash();
    }
    /* …et revient se poser en se retournant */
    box.classList.remove('omen', 'omen5');
    if (tier >= 5) el.classList.add('epic'); else if (tier >= 4) el.classList.add('slow');
    el.classList.remove('is-back');
    sfx.flip(tier);
    buzz(tier >= 4 ? [30, 50, 40] : tier === 3 ? [15, 30, 20] : 8);
    move(box, POSE.lifted(), { dur: tier >= 5 ? 1500 : tier >= 4 ? 900 : 480, ease: EASE.soft });
    await wait(tier >= 5 ? 1180 : tier >= 4 ? 640 : 330);
    if (mine !== gen) return;
    /* la carte se repose ; les belles cartes s'accompagnent d'un halo, d'un peu de poussière et de leur rang */
    box.classList.add('lit');
    move(box, POSE.stack(0), { dur: 620, ease: EASE.spring });
    if (tier >= 3) {
      bloom.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: tier >= 4 ? 0.85 : 0.5, transform: 'scale(1.5)', offset: 0.3 }, { opacity: 0, transform: 'scale(2.3)' }],
        { duration: (tier >= 5 ? 2100 : tier >= 4 ? 1500 : 1000) * slow(), easing: 'cubic-bezier(.2,.6,.3,1)' });
      const c = clientOf(POSE.stack(0));
      particles.burst(c[0], c[1], { count: tier === 5 ? 60 : tier === 4 ? 32 : 14, colors: dustOf(card), shapes: ['dot'], speed: [40, tier >= 4 ? 300 : 190], life: [0.9, 2.2], size: [1, 2.6], gravity: -18, drag: 0.955 });
      if (tier >= 5) {
        /* une onde part de la carte, et une gerbe d'éclats retombe */
        ring.animate([{ opacity: 0.9, transform: 'scale(.3)' }, { opacity: 0, transform: 'scale(2.6)' }], { duration: 1300 * slow(), easing: 'cubic-bezier(.15,.7,.3,1)' });
        particles.fountain(c[0], c[1] + M.ch * 0.2, { colors: dustOf(card), waves: 5 });
      }
      label.textContent = card.limited && !card.variant ? 'Édition limitée' + (serials.get(card.id) ? ' · n° ' + serials.get(card.id) + ' / ' + card.limited : '')
        : cat.tierById.get(card.tier).name + (card.variant ? ' · ' + VARIANTS[card.variant].name : '');
      label.style.setProperty('--n', label.textContent.length);
      label.classList.add('on');
      op.classList.add('named');
    }
    clues.classList.remove('on');
    await wait(tier >= 5 ? 1100 : tier >= 4 ? 620 : 240);
    if (mine !== gen) return;
    if (card.variant === 'legend') { await apotheosis(i); if (mine !== gen) return; }
    op.classList.remove('epic');
    box.classList.add('tagged');
    /* la carte découverte s'incline sous la souris : de quoi faire jouer ses reflets */
    if (!untilt) untilt = tiltCard(el, 13);
    shown = true;
    busy = false;
    const left = pulls.length - i - 1;
    setInfo('<b>' + (i + 1) + '</b> / ' + pulls.length + (hints-- > 0 ? ' · touche pour ' + (left ? 'voir la suivante' : 'terminer') : ''), false);
  }
  /* ---------- l'apothéose d'une carte légendaire ---------- */
  /* La musique : le lecteur officiel de YouTube, dans une petite vignette qui reste visible ; il démarre muet, puis on règle son volume et on
     lui rend le son (les navigateurs laissent toujours démarrer un lecteur muet). Le jeu ne lui parle que par messages, sans charger de script. */
  function startSong(card) {
    const def = LEGEND_SONGS[card.base || card.id];
    if (!def || !soundOn() || song) return;
    const tile = document.createElement('div');
    tile.className = 'op-song';
    tile.innerHTML = '<iframe title="' + esc(def.title) + '" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin" src="' + YT + '/embed/' + encodeURIComponent(def.video)
      + '?autoplay=1&mute=1&start=' + def.start + '&end=' + def.end + '&controls=0&rel=0&playsinline=1&iv_load_policy=3&enablejsapi=1&origin=' + encodeURIComponent(location.origin) + '"></iframe>'
      + '<span>' + icon('i-sound') + esc(def.title) + '</span>';
    op.appendChild(tile);
    const frame = tile.firstChild;
    const tell = (func, args) => { try { frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: args || [], id: 'song', channel: 'widget' }), YT); } catch (e) { /* lecteur pas encore prêt */ } };
    /* son volume suit le réglage de la musique du joueur */
    const vol = () => Math.round(Math.min(100, Math.max(3, def.volume * musicScale())));
    const wake = () => { try { frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'song', channel: 'widget' }), YT); } catch (e) { /* idem */ } tell('setVolume', [vol()]); tell('unMute'); tell('playVideo'); };
    frame.addEventListener('load', () => { wake(); [500, 1200, 2400].forEach((ms) => setTimeout(() => { if (song && song.tile === tile) wake(); }, ms)); });
    song = { tile, tell, vol, volume: vol(), timer: setTimeout(() => stopSong(), (def.end - def.start + 4) * 1000) };
  }
  /** Coupe la musique : en fondu, ou tout de suite. */
  function stopSong(now) {
    if (!song) return;
    const s = song;
    song = null;
    clearTimeout(s.timer);
    if (now) { s.tile.remove(); return; }
    let v = s.volume;
    const fade = setInterval(() => { v -= Math.max(2, s.volume / 8); if (v <= 0) { clearInterval(fade); s.tile.remove(); } else s.tell('setVolume', [Math.round(v)]); }, 110);
    s.tile.classList.add('out');
  }
  /** La carte légendaire vient d'être retournée : elle s'élève et fait lentement un tour complet sur elle-même sous une pluie d'or, la lumière
      court sur ses reflets, ses titres mondiaux s'allument un à un. Une vingtaine de secondes ; un toucher l'abrège. */
  async function apotheosis(i) {
    const mine = gen, box = boxes[i], el = cardEl(i), inner = el.querySelector('.card-in'), card = pulls[i].card;
    const cups = [...el.querySelectorAll('.card-cups span')], gold = ['#ffd978', '#fff6d6', '#ffffff', '#f0cd72'];
    let over = false, raf = 0, skipped = null;
    startSong(card);
    op.classList.add('apo');
    el.classList.add('apo');
    box.style.zIndex = 34;
    box.classList.remove('omen', 'omen5');
    setInfo('', false);
    move(box, { x: 0, y: M.heroY + M.ch * 0.04, s: Math.min(1.14, (M.h - 30) / M.ch), r: 0 }, { dur: 2400, ease: EASE.inOut });
    /* un tour complet : les deux faces existent le temps du tour, et la lumière de la carte suit une lente ronde */
    el.classList.add('is-free', 'tilting');
    const spin = inner.animate([{ transform: 'rotateX(5deg) rotateY(0deg)' }, { transform: 'rotateX(-4deg) rotateY(180deg)', offset: 0.5 }, { transform: 'rotateX(5deg) rotateY(360deg)' }],
      { duration: 8200 * slow(), delay: 2200 * slow(), easing: 'cubic-bezier(.5,0,.3,1)' });
    const t0 = performance.now();
    const light = (now) => {
      if (over) return;
      const t = (now - t0) / 1000;
      el.style.setProperty('--hx', (50 + 44 * Math.sin(t * 0.9)).toFixed(1) + '%');
      el.style.setProperty('--hy', (34 + 26 * Math.cos(t * 0.65)).toFixed(1) + '%');
      raf = requestAnimationFrame(light);
    };
    raf = requestAnimationFrame(light);
    /* la pluie d'or tombe du haut de l'écran */
    const rain = setInterval(() => {
      for (let k = 0; k < 2; k++) particles.burst(M.x + (Math.random() - 0.5) * M.w * 0.9, M.y - M.h / 2 - 10, { count: 2, colors: gold, shapes: ['dot'], speed: [20, 90], life: [2.6, 4.4], size: [1, 2.8], gravity: 70, spread: 0.5, angle: Math.PI / 2, drag: 0.992 });
    }, 110);
    endApo = () => {
      if (over) return;
      over = true;
      endApo = null;
      clearInterval(rain);
      cancelAnimationFrame(raf);
      spin.cancel();
      el.classList.remove('is-free', 'tilting', 'apo');
      el.style.removeProperty('--hx'); el.style.removeProperty('--hy');
      cups.forEach((c) => c.classList.remove('lit'));
      op.classList.remove('apo');
      if (skipped) skipped();
    };
    /* le temps passe par petites étapes, pour qu'un toucher puisse abréger */
    const pause = (ms) => new Promise((resolve) => { const t = setTimeout(resolve, ms * slow()); skipped = () => { clearTimeout(t); resolve(); }; });
    await pause(2600);
    /* ses titres, un à un */
    for (let n = 0; n < cups.length && !over && mine === gen; n++) {
      cups[n].classList.add('lit');
      sfx.clue(n);
      label.textContent = 'Champion du monde ' + cups[n].textContent.trim();
      label.style.setProperty('--n', label.textContent.length);
      await pause(1250);
    }
    if (!over && mine === gen) {
      label.textContent = cat.tierById.get(card.tier).name + ' · ' + VARIANTS[card.variant].name;
      label.style.setProperty('--n', label.textContent.length);
      const c = clientOf(POSE.stack(0));
      particles.fountain(c[0], c[1] + M.ch * 0.25, { colors: gold, waves: 7 });
      sfx.flip(5);
      await pause(4200);
    }
    if (mine !== gen) { if (endApo) endApo(); return; }
    if (endApo) endApo();
    label.textContent = cat.tierById.get(card.tier).name + ' · ' + VARIANTS[card.variant].name;
    label.style.setProperty('--n', label.textContent.length);
    await move(box, POSE.stack(0), { dur: 900, ease: EASE.soft });
  }
  /** Un éclair blanc, très bref, sur tout l'écran. */
  function flash() {
    flashEl.animate([{ opacity: 0 }, { opacity: 0.85, offset: 0.12 }, { opacity: 0 }], { duration: 520 * slow(), easing: 'ease-out' });
  }
  /* Une All-Pro : la lumière baisse, trois indices s'annoncent, la carte attend.
     Une carte très rare (rang 5 d'éclat : MVP, légendaire, édition limitée, belle carte en version spéciale) : le noir se fait presque
     entièrement, un faisceau tombe sur elle, un cœur bat de plus en plus vite pendant que les indices tombent un à un. */
  async function prelude(i, tier) {
    const mine = gen, card = pulls[i].card, epic = tier >= 5;
    boxes[i].style.zIndex = 30;
    op.classList.add('rare', 'rays');
    if (epic) op.classList.add('epic');
    sfx.rise(epic ? 3.4 : 1.75);
    const parts = [
      card.country ? '<span><img src="' + flagUrl(card.country) + '" alt="">' + esc(cat.countries[card.country]) + '</span>' : '',
      '<span>' + esc(card.label || ROLE_LABEL[card.role]) + '</span>', '<span>' + esc(card.league) + '</span>',
      card.variant ? '<span class="v-' + card.variant + '">' + VARIANTS[card.variant].name + '</span>' : card.limited ? '<span class="v-ceo">Édition limitée</span>' : '',
    ].filter(Boolean);
    clues.innerHTML = '';
    /* longueur de la ligne d'indices une fois complète : le texte, plus la place du drapeau et des séparateurs */
    clues.style.setProperty('--n', parts.reduce((sum, html) => sum + html.replace(/<[^>]+>/g, '').length + 3, 0));
    clues.classList.add('on');
    /* le cœur : un battement sourd, et la lumière qui palpite avec lui */
    const beat = () => {
      sfx.heart(); buzz([34, 70, 46]);
      bloom.animate([{ opacity: 0, transform: 'scale(.7)' }, { opacity: 0.4, transform: 'scale(1.05)', offset: 0.25 }, { opacity: 0, transform: 'scale(1.5)' }], { duration: 620 * slow(), easing: 'ease-out' });
    };
    await wait(epic ? 700 : 380);
    for (let n = 0; n < parts.length; n++) {
      if (mine !== gen) return;
      if (epic) { beat(); await wait(Math.max(360, 640 - n * 90)); if (mine !== gen) return; }
      clues.insertAdjacentHTML('beforeend', parts[n]);
      sfx.clue(n);
      buzz(10);
      await wait(epic ? 620 : 460);
    }
    if (epic) { if (mine !== gen) return; beat(); await wait(430); if (mine !== gen) return; beat(); }
    await wait(epic ? 520 : 260);
  }
  async function next() {
    const mine = gen, i = k, box = boxes[i];
    busy = true;
    if (untilt) { untilt(); untilt = null; }
    /* la carte découverte part se ranger sur le présentoir, par une courbe ; le paquet remonte d'un cran */
    box.classList.remove('tagged');
    box.style.zIndex = 40;
    label.classList.remove('on');
    op.classList.remove('named');
    op.classList.remove('rare', 'rays', 'epic');
    stopSong();
    sfx.slide();
    const flown = place(box, 'tray', i, { dur: 520, ease: EASE.inOut, arc: M.ch * 0.07 }).then(() => { if (mine === gen) { box.style.zIndex = 4; op.querySelectorAll('.op-tray i')[i].classList.add('full'); } });
    k++;
    shown = false;
    for (let j = k; j < boxes.length; j++) place(boxes[j], 'stack', j - k, { dur: 460, ease: EASE.out, delay: 90 });
    if (k < boxes.length) {
      /* une carte ordinaire se retourne dans la foulée ; une belle carte attend sur le dessus du paquet : elle se met à briller,
         et c'est au joueur de la retourner */
      if (shineOf(pulls[k].card) < 4) {
        await wait(210);
        if (mine !== gen) return;
        await flip(k);
        return;
      }
      await wait(520);
      if (mine !== gen) return;
      omen(k);
      busy = false;
      setInfo('Quelque chose brille… touche la carte pour la retourner', true);
    } else {
      await flown;
      if (mine !== gen) return;
      finish();
    }
  }

  /* ---------- passer l'animation ---------- */
  async function skip() {
    if (!ready || op.dataset.stage === 'done' || op.dataset.stage === 'enter') return;
    gen++;
    const mine = gen;
    busy = true;
    drag = null;
    if (untilt) { untilt(); untilt = null; }
    omen(null);
    if (endApo) endApo();
    stopSong();
    op.classList.remove('rare', 'rays', 'epic', 'glow', 'glow5');
    clues.classList.remove('on');
    label.classList.remove('on');
    op.classList.remove('named');
    setInfo('', false);
    for (const el of [front, back]) {
      if (!el.isConnected) continue;
      el.getAnimations().forEach((a) => a.cancel());
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).finished.then(() => el.remove()).catch(() => {});
    }
    setStage('stack');
    boxes.forEach((b) => { b.getAnimations().forEach((a) => a.cancel()); b.classList.add('in', 'out'); b.classList.remove('tagged', 'omen', 'omen5'); b.style.zIndex = 10; });
    sfx.whoosh();
    await Promise.all(boxes.map((b, i) => place(b, 'grid', i, { dur: 560, ease: EASE.soft, delay: i * 55 })));
    if (mine !== gen) return;
    /* les cartes encore cachées se retournent en cascade, les plus belles en dernier */
    const order = boxes.map((b, i) => i).filter((i) => cardEl(i).classList.contains('is-back')).sort((a, b) => pulls[a].card.tier - pulls[b].card.tier || a - b);
    for (const i of order) {
      cardEl(i).classList.remove('is-back');
      boxes[i].classList.add('lit');
      sfx.flip(Math.min(3, shineOf(pulls[i].card)));
      await wait(150);
      if (mine !== gen) return;
    }
    await wait(order.length ? 360 : 0);
    if (mine !== gen) return;
    k = boxes.length;
    finish(true);
  }

  /* ---------- 5. bilan ---------- */
  function finish(placed) {
    const fresh = pulls.filter((p) => p.isNew).length;
    setStage('done');
    setBeam(best);
    omen(null);
    op.classList.remove('rare', 'rays', 'epic');
    label.classList.remove('on');
    op.classList.remove('named');
    const mine = gen;
    boxes.forEach((b) => b.classList.add('lit'));
    Promise.all(!placed && fx ? boxes.map((b, i) => { b.style.zIndex = 10; return place(b, 'grid', i, { dur: 640, ease: EASE.soft, delay: i * 60 }); }) : [])
      .then(() => { if (mine === gen) boxes.forEach((b) => b.classList.add('tagged')); });
    /* un doublon se revend sur-le-champ : le bouton est sous sa carte (jamais pour une édition limitée ; il reste toujours un exemplaire) */
    if (quick) pulls.forEach((p, i) => {
      const gain = p.qty > 1 && !p.card.limited ? quick.price(p.card) : 0;
      if (gain > 0) boxes[i].insertAdjacentHTML('beforeend', '<button class="op-sell" type="button" data-sell="' + i + '" data-say="Revendre · +' + gain + '">Revendre · +' + gain + '</button>');
    });
    /* Sur téléphone, les cartes du bilan sont sur deux rangées : le bouton d'une carte du haut tomberait sous la rangée du bas. Un seul
       bouton, sous le bilan, revend alors d'un coup tous les exemplaires en trop (il en reste toujours un) — des cartes ordinaires
       seulement, comme « Tout vendre » au marché : une belle carte en double se vend une par une, depuis la collection. */
    bulk = quick ? pulls.map((p, i) => ({ p, i, n: p.qty - 1 })).filter((x) => x.n > 0 && !x.p.card.limited && !x.p.card.variant && x.p.card.tier <= quick.bulkTier) : [];
    const total = bulk.reduce((sum, x) => sum + x.n * quick.price(x.p.card), 0), copies = bulk.reduce((sum, x) => sum + x.n, 0);
    const say = 'Revendre ' + (copies > 1 ? 'les ' + copies + ' doublons' : 'le doublon') + ' · +' + total;
    setInfo('<b>' + (fresh ? fresh + (fresh > 1 ? ' nouvelles cartes' : ' nouvelle carte') : 'Aucune nouvelle carte') + '</b>'
      + (total > 0 ? '<button class="op-sellall" type="button" data-sellall data-say="' + say + '">' + say + '</button>' : '')
      + (matchMedia('(pointer: coarse)').matches ? '' : '<span class="op-hint">Clique une carte pour l\'examiner</span>'), false);
    if (fx) sfx.done();
    busy = false;
  }
  /* examiner une carte du bilan : seule, en grand, on la tourne et on la retourne du doigt */
  function inspect(i) {
    if (busy || i === null) return;
    const p = pulls[i];
    sfx.slide();
    inspectCard(p.card, cat, { serial: p.serial, title: p.card.name });
  }
  /** Revend un exemplaire du doublon n° i. Le premier clic arme le bouton, le second vend. */
  async function sell(btn) {
    const i = Number(btn.dataset.sell), p = pulls[i];
    if (!btn.classList.contains('sure')) {
      btn.classList.add('sure');
      btn.textContent = 'Confirmer';
      setTimeout(() => { if (btn.isConnected && btn.classList.contains('sure') && !btn.disabled) { btn.classList.remove('sure'); btn.textContent = btn.dataset.say; } }, 3500);
      return;
    }
    btn.disabled = true;
    const res = await quick.sell(p.card);
    if (closed) return;
    if (!res) { btn.disabled = false; btn.classList.remove('sure'); btn.textContent = btn.dataset.say; return; }
    p.qty = res.left;
    sfx.done();
    const tag = boxes[i].querySelector('.op-tag');
    if (tag) tag.textContent = '×' + res.left;
    /* il ne reste qu'un exemplaire : plus rien à revendre */
    if (res.left > 1) { btn.disabled = false; btn.classList.remove('sure'); btn.textContent = btn.dataset.say; }
    else { btn.classList.remove('sure'); btn.classList.add('sold'); btn.textContent = '+' + res.coins + ' crédits'; }
  }

  /** Téléphone : revend d'un coup les exemplaires en trop des doublons ordinaires du bilan. Le premier toucher arme le bouton, le second vend. */
  async function sellAll(btn) {
    if (!btn.classList.contains('sure')) {
      btn.classList.add('sure');
      btn.textContent = 'Confirmer · +' + btn.dataset.say.split('+').pop();
      setTimeout(() => { if (btn.isConnected && btn.classList.contains('sure') && !btn.disabled) { btn.classList.remove('sure'); btn.textContent = btn.dataset.say; } }, 3500);
      return;
    }
    btn.disabled = true;
    let coins = 0;
    for (const x of bulk) {
      if (x.p.qty <= 1) continue;
      const res = await quick.sell(x.p.card, x.p.qty - 1);
      if (closed) return;
      if (!res) continue;
      coins += res.coins;
      x.p.qty = res.left;
      const tag = boxes[x.i].querySelector('.op-tag');
      if (tag) tag.textContent = '×' + res.left;
      /* son propre bouton (sur un écran plus large) n'a plus rien à vendre */
      const own = boxes[x.i].querySelector('.op-sell');
      if (own && res.left <= 1) { own.classList.remove('sure'); own.classList.add('sold'); own.textContent = '+' + res.coins + ' crédits'; }
    }
    btn.classList.remove('sure');
    if (coins > 0) { sfx.done(); btn.classList.add('sold'); btn.textContent = '+' + coins + ' crédits'; }
    else { btn.disabled = false; btn.textContent = btn.dataset.say; }
  }

  /* ---------- gestes ---------- */
  function onClick(e) {
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'sound') {
      toggleVolume(soundBtn, () => {
        drawSound();
        if (!soundOn()) stopSong(true);
        else if (song) { song.volume = song.vol(); song.tell('setVolume', [song.volume]); }
      });
      return;
    }
    if (act && act.dataset.act === 'skip') { skip(); return; }
    const go = e.target.closest('[data-go]');
    if (go) { if (leave && op.dataset.stage === 'done') { goTo = go.dataset.go; leave(); } return; }
    if (e.target.closest('.op-head') || e.target.closest('.op-song')) return;
    if (endApo) { endApo(); return; }
    if (op.dataset.stage === 'stack') { advance(); return; }
    if (op.dataset.stage === 'done') {
      const all = e.target.closest('[data-sellall]');
      if (all) { if (!all.disabled && !all.classList.contains('sold')) sellAll(all); return; }
      const btn = e.target.closest('[data-sell]');
      if (btn) { if (!btn.disabled && !btn.classList.contains('sold')) sell(btn); return; }
      const box = e.target.closest('.op-cardbox');
      if (box) inspect(Number(box.dataset.i));
    }
  }
  function onKey(e) {
    if (e.key !== ' ' && e.key !== 'Enter' && e.key !== 'Escape') return;
    if (closed) return;
    e.preventDefault();
    const st = op.dataset.stage;
    /* (pendant l'examen d'une carte, c'est lui qui écoute le clavier) */
    if (document.querySelector('.insp')) return;
    if (e.key === 'Escape') { skip(); return; }
    if (st === 'sealed') finishTear();
    else if (st === 'stack') advance();
    else if (st === 'done') { if (leave) leave(); }
  }
}
