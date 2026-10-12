/* L'ouverture d'un sachet.
   1. Le sachet quitte l'accueil et vient au centre de l'écran.
   2. Le joueur déchire la bande du haut : en glissant le doigt d'une encoche à l'autre, ou d'un simple toucher.
   3. Le sachet bâille, les cinq cartes en sortent en éventail, le sachet tombe, les cartes se rassemblent.
   4. Il découvre les cartes une à une, en grand ; chacune va ensuite se ranger sur le présentoir du bas.
      Une très belle carte (All-Pro, MVP, ou version holographique ou full art d'une carte rare) se fait attendre :
      la lumière baisse, son pays, son poste et sa ligue s'annoncent, puis elle se retourne.
   5. Bilan : les cinq cartes côte à côte.
   Le serveur a déjà tout décidé quand l'animation commence : ici, on ne fait que mettre en scène. */
import { ROLE_LABEL, TIER_COLOR } from './config.js';
import { VARIANTS, cardHTML, esc, flagUrl, photoUrl, tiltCard, variantRank } from './cards.js';
import { createFx } from './fx.js';
import { TEAR_Y, packBackHTML, packSplitHTML, shapeBack, shapeBody, tearPoints } from './pack.js';
import { setSound, sfx, soundOn } from './sound.js';

export { packHTML } from './pack.js';

const PRISM = ['#ffe7a8', '#9fe8ff', '#ffffff'];
const RAINBOW = ['#ff9cc6', '#ffd88a', '#a8ffdc', '#9ccfff', '#d3b4ff', '#ffffff'];
const dustOf = (card) => (card.variant === 'holo' ? RAINBOW : card.tier === 5 ? PRISM : [TIER_COLOR[card.tier], '#ffffff', '#f0e6d2']);
/* l'éclat d'une carte, de 1 à 5 : son rang, relevé d'un cran pour une holographique et de deux pour une full art */
const shineOf = (card) => Math.min(5, card.tier + variantRank(card));
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
    from : le sachet de l'accueil, d'où part celui de l'ouverture.
    Si le serveur refuse, l'écran se referme et l'erreur est relancée telle quelle. */
export async function runOpening({ request, getCat, fx, size, from }) {
  let cat = getCat();
  const op = document.createElement('div');
  op.className = 'op';
  op.dataset.stage = 'enter';
  op.innerHTML = '<canvas class="op-fx"></canvas>'
    + '<header class="op-head"><h2>Ouverture du pack</h2><span class="spacer"></span>'
    + '<button class="op-icon" type="button" data-act="sound" aria-label="Couper ou remettre le son"></button>'
    + '<button class="btn" type="button" data-act="skip">Passer</button></header>'
    + '<div class="op-stage"><div class="op-tray" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>'
    + '<div class="op-item op-back">' + packBackHTML() + '</div>'
    + '<div class="op-item op-front">' + packSplitHTML(cat.season, size) + '</div>'
    + '<div class="op-dim"></div><div class="op-rays"></div><div class="op-bloom"></div>'
    + '<div class="op-clues"></div><div class="op-label"></div></div>'
    + '<footer class="op-foot"><p class="op-info" aria-live="polite"></p><div class="actions">'
    + '<button class="btn primary big" type="button" data-go="">Continuer</button><button class="btn big" type="button" data-go="collection">Ma collection</button></div></footer>';
  const $ = (sel) => op.querySelector(sel);
  const stage = $('.op-stage'), front = $('.op-front'), back = $('.op-back'), info = $('.op-info'), clues = $('.op-clues'), label = $('.op-label'), bloom = $('.op-bloom');
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
    /* sorties aux deux tiers, en éventail : elles tournent autour d'un point resté dans le sachet */
    fan: (i) => {
      const a = ((i - 2) * 6 * Math.PI) / 180, h = M.ch * M.is, R = 0.8 * h;
      return { x: R * Math.sin(a), y: M.fanY + R * (1 - Math.cos(a)), s: M.is, r: (i - 2) * 6 };
    },
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
  let k = 0, shown = false, busy = true, zoomed = null, goTo = null, leave = null, closed = false;
  let gen = 0;                 // change quand le joueur passe l'animation : ce qui était en cours s'arrête
  let hints = 2;               // nombre de fois où l'on rappelle « touche pour continuer »
  let tearP = 0, tearDir = 1, drag = null;   // part de la bande déjà déchirée (0 à 1), sens du geste, geste en cours
  const setStage = (name) => { op.dataset.stage = name; };
  const setInfo = (html, pulse) => { info.innerHTML = html; info.classList.toggle('pulse', !!pulse); };
  /* la lumière de la scène prend la couleur de la carte */
  const setBeam = (card) => { op.style.setProperty('--beam', card.tier >= 3 ? TIER_COLOR[card.tier] : '#c8aa6e'); op.dataset.tier = card.tier; op.dataset.variant = card.variant || ''; };
  let untilt = null;
  const cardEl = (i) => boxes[i].querySelector('.card');
  const clientOf = (pose) => [M.x + pose.x, M.y + pose.y];

  function close() {
    closed = true;
    gen++;
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
  pulls = data.pack.cards.map((p) => ({ qty: p.qty, isNew: p.isNew, card: cat.cardById.get(p.id) })).filter((p) => p.card);
  if (!pulls.length) { close(); throw new Error('sachet vide : cartes inconnues du catalogue'); }
  imgs = pulls.map((p) => preload(photoUrl(p.card)));
  const best = pulls.reduce((a, p) => (shineOf(p.card) > shineOf(a) ? p.card : a), pulls[0].card);
  /* les cartes attendent dans le sachet, face cachée : la première sur le dessus */
  boxes = pulls.map((p, i) => {
    const b = document.createElement('div');
    b.className = 'op-item op-cardbox t' + p.card.tier + (p.card.variant ? ' v-' + p.card.variant : '');
    b.dataset.i = i;
    b.style.zIndex = 10 - i;
    b.innerHTML = cardHTML(p.card, cat, { back: true, eager: true, cls: 'is-back' }) + '<i class="op-sheen"></i>'
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
    await wait(70);
    if (mine !== gen) return;
    /* les cartes montent en éventail ; le sachet recule un peu sous l'effort, puis tombe */
    sfx.slideOut();
    const risen = Promise.all(boxes.map((b, i) => place(b, 'fan', i, { dur: 700, ease: EASE.out, delay: (4 - i) * 38 })));
    for (const el of [front, back]) move(el, { x: 0, y: M.drop, s: 1, r: 0 }, { dur: 620, ease: EASE.inOut });
    await wait(430);
    if (mine !== gen) return;
    boxes.forEach((b) => b.classList.add('out'));
    for (const el of [front, back]) {
      move(el, { x: -tearDir * M.pw * 0.12, y: M.h * 0.5 + M.ph * 0.7, s: 0.96, r: -tearDir * 7 }, { dur: 620, ease: EASE.in });
      el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], { duration: 620 * slow(), fill: 'forwards' });
    }
    await risen;
    await wait(110);
    if (mine !== gen) return;
    /* elles se rassemblent en un paquet, au centre */
    sfx.whoosh();
    await Promise.all(boxes.map((b, i) => place(b, 'stack', i, { dur: 760, ease: EASE.soft, delay: i * 34 })));
    if (mine !== gen) return;
    front.remove(); back.remove();
    setBeam(best);
    setStage('stack');
    setInfo('Touche la carte pour la retourner', true);
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
    if (tier >= 4) await prelude(i);
    if (mine !== gen) return;
    box.style.zIndex = tier >= 4 ? 30 : 16;
    move(box, POSE.lifted(), { dur: 260, ease: EASE.out });
    await wait(110);
    if (mine !== gen) return;
    if (tier >= 4) el.classList.add('slow');
    el.classList.remove('is-back');
    sfx.flip(tier);
    buzz(tier >= 4 ? [30, 50, 40] : tier === 3 ? [15, 30, 20] : 8);
    await wait(tier >= 4 ? 520 : 300);
    if (mine !== gen) return;
    /* la carte se repose ; les belles cartes s'accompagnent d'un halo, d'un peu de poussière et de leur rang */
    box.classList.add('lit');
    move(box, POSE.stack(0), { dur: 620, ease: EASE.spring });
    if (tier >= 3) {
      bloom.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: tier >= 4 ? 0.85 : 0.5, transform: 'scale(1.5)', offset: 0.3 }, { opacity: 0, transform: 'scale(2.3)' }],
        { duration: (tier >= 4 ? 1500 : 1000) * slow(), easing: 'cubic-bezier(.2,.6,.3,1)' });
      const c = clientOf(POSE.stack(0));
      particles.burst(c[0], c[1], { count: tier === 5 ? 46 : tier === 4 ? 32 : 14, colors: dustOf(card), shapes: ['dot'], speed: [40, tier >= 4 ? 300 : 190], life: [0.9, 2.2], size: [1, 2.6], gravity: -18, drag: 0.955 });
      label.textContent = cat.tierById.get(card.tier).name + (card.variant ? ' · ' + VARIANTS[card.variant].name : '');
      label.style.setProperty('--n', label.textContent.length);
      label.classList.add('on');
      op.classList.add('named');
    }
    clues.classList.remove('on');
    await wait(tier >= 4 ? 620 : 240);
    if (mine !== gen) return;
    box.classList.add('tagged');
    /* la carte découverte s'incline sous la souris : de quoi faire jouer ses reflets */
    if (!untilt) untilt = tiltCard(el, 13);
    shown = true;
    busy = false;
    const left = pulls.length - i - 1;
    setInfo('<b>' + (i + 1) + '</b> / ' + pulls.length + (hints-- > 0 ? ' · touche pour ' + (left ? 'voir la suivante' : 'terminer') : ''), false);
  }
  /* une All-Pro ou une MVP : la lumière baisse, trois indices s'annoncent, la carte attend */
  async function prelude(i) {
    const mine = gen, card = pulls[i].card;
    boxes[i].style.zIndex = 30;
    op.classList.add('rare', 'rays');
    sfx.rise(1.75);
    const parts = [
      card.country ? '<span><img src="' + flagUrl(card.country) + '" alt="">' + esc(cat.countries[card.country]) + '</span>' : '',
      '<span>' + ROLE_LABEL[card.role] + '</span>', '<span>' + esc(card.league) + '</span>',
      card.variant ? '<span class="v-' + card.variant + '">' + VARIANTS[card.variant].name + '</span>' : '',
    ].filter(Boolean);
    clues.innerHTML = '';
    /* longueur de la ligne d'indices une fois complète : le texte, plus la place du drapeau et des séparateurs */
    clues.style.setProperty('--n', parts.reduce((sum, html) => sum + html.replace(/<[^>]+>/g, '').length + 3, 0));
    clues.classList.add('on');
    await wait(380);
    for (let n = 0; n < parts.length; n++) {
      if (mine !== gen) return;
      clues.insertAdjacentHTML('beforeend', parts[n]);
      sfx.clue(n);
      buzz(10);
      await wait(460);
    }
    await wait(260);
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
    op.classList.remove('rare', 'rays');
    sfx.slide();
    const flown = place(box, 'tray', i, { dur: 520, ease: EASE.inOut, arc: M.ch * 0.07 }).then(() => { if (mine === gen) { box.style.zIndex = 4; op.querySelectorAll('.op-tray i')[i].classList.add('full'); } });
    k++;
    shown = false;
    for (let j = k; j < boxes.length; j++) place(boxes[j], 'stack', j - k, { dur: 460, ease: EASE.out, delay: 90 });
    if (k < boxes.length) {
      await wait(210);
      if (mine !== gen) return;
      await flip(k);
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
    op.classList.remove('rare', 'rays');
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
    boxes.forEach((b) => { b.getAnimations().forEach((a) => a.cancel()); b.classList.add('in', 'out'); b.classList.remove('tagged'); b.style.zIndex = 10; });
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
    op.classList.remove('rare', 'rays');
    label.classList.remove('on');
    op.classList.remove('named');
    const mine = gen;
    boxes.forEach((b) => b.classList.add('lit'));
    Promise.all(!placed && fx ? boxes.map((b, i) => { b.style.zIndex = 10; return place(b, 'grid', i, { dur: 640, ease: EASE.soft, delay: i * 60 }); }) : [])
      .then(() => { if (mine === gen) boxes.forEach((b) => b.classList.add('tagged')); });
    setInfo('<b>' + (fresh ? fresh + (fresh > 1 ? ' nouvelles cartes' : ' nouvelle carte') : 'Aucune nouvelle carte') + '</b>', false);
    if (fx) sfx.done();
    busy = false;
  }
  /* revoir en grand une carte du bilan */
  function inspect(i) {
    if (busy) return;
    if (zoomed !== null) {
      const j = zoomed, b = boxes[j];
      zoomed = null;
      op.classList.remove('rare');
      sfx.slide();
      place(b, 'grid', j, { dur: 420, ease: EASE.out }).then(() => { b.style.zIndex = 10; b.classList.add('tagged'); });
      return;
    }
    if (i === null) return;
    zoomed = i;
    setBeam(pulls[i].card);
    boxes[i].style.zIndex = 30;
    boxes[i].classList.remove('tagged');
    op.classList.add('rare');
    sfx.slide();
    where.set(boxes[i], ['zoom', 0]);
    move(boxes[i], POSE.zoom(), { dur: 460, ease: EASE.soft });
  }

  /* ---------- gestes ---------- */
  function onClick(e) {
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'sound') { setSound(!soundOn()); drawSound(); sfx.click(); return; }
    if (act && act.dataset.act === 'skip') { skip(); return; }
    const go = e.target.closest('[data-go]');
    if (go) { if (leave && op.dataset.stage === 'done') { goTo = go.dataset.go; leave(); } return; }
    if (e.target.closest('.op-head')) return;
    if (op.dataset.stage === 'stack') { advance(); return; }
    if (op.dataset.stage === 'done') {
      const box = e.target.closest('.op-cardbox');
      inspect(zoomed !== null ? null : box ? Number(box.dataset.i) : null);
    }
  }
  function onKey(e) {
    if (e.key !== ' ' && e.key !== 'Enter' && e.key !== 'Escape') return;
    if (closed) return;
    e.preventDefault();
    const st = op.dataset.stage;
    if (e.key === 'Escape') { if (zoomed !== null) inspect(null); else skip(); return; }
    if (st === 'sealed') finishTear();
    else if (st === 'stack') advance();
    else if (st === 'done') { if (zoomed !== null) inspect(null); else if (leave) leave(); }
  }
}
