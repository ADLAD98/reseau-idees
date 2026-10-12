/* L'examen d'une carte : en grand, seule sous la lumière. On la tourne du doigt ou de la souris (un tour complet si l'on veut : le dos aussi
   se regarde), elle garde un peu d'élan quand on la lâche, et ses reflets suivent le mouvement — c'est ici qu'une holographique se juge.
   Sur un téléphone, on peut aussi faire jouer les reflets en penchant l'appareil. */
import { cardHTML, esc } from './cards.js';
import { sfx } from './sound.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Ouvre l'examen de la carte. opts : serial (numéro d'une édition limitée), title et note (ce qui s'écrit sous la carte). Renvoie de quoi le refermer. */
export function inspectCard(card, cat, opts = {}) {
  const box = document.createElement('div');
  box.className = 'insp';
  box.innerHTML = '<div class="insp-light"></div>'
    + '<header class="insp-head"><span>' + esc(opts.title || card.name) + '</span><button class="op-icon" type="button" data-act="close" aria-label="Fermer">'
    + '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-close"/></svg></button></header>'
    + '<div class="insp-stage"><div class="insp-card">' + cardHTML(card, cat, { back: true, eager: true, serial: opts.serial, cls: 'is-free' }) + '<i class="insp-floor"></i></div></div>'
    + '<footer class="insp-foot"><p>' + esc(opts.note || 'Glisse pour faire tourner la carte') + '</p><div class="actions">'
    + '<button class="btn" type="button" data-act="flip">Retourner</button>'
    + '<button class="btn" type="button" data-act="gyro" hidden>Pencher le téléphone</button>'
    + '<button class="btn primary" type="button" data-act="close">Fermer</button></div></footer>';
  const el = box.querySelector('.card'), inner = el.querySelector('.card-in'), stage = box.querySelector('.insp-stage');
  /* la lumière de la carte suit son orientation (et non plus sa petite ronde habituelle) ; le joyau du cadre tourne avec elle */
  el.classList.add('tilting');
  const gem = el.querySelector('.card-gem');
  if (gem) inner.appendChild(gem);
  const scroll = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(box);

  /* l'orientation de la carte : ry (un tour complet possible), rx (penchée vers l'avant ou l'arrière) ; leur vitesse ; ce vers quoi elle va */
  let ry = -24, rx = 6, vy = 0, vx = 0, target = null, drag = null, idle = 0, raf = 0, closed = false, tiltY = 0, tiltX = 0, last = performance.now();
  function draw() {
    const y = ry + tiltY, x = clamp(rx + tiltX, -34, 34);
    inner.style.transform = 'rotateX(' + x.toFixed(2) + 'deg) rotateY(' + y.toFixed(2) + 'deg)';
    /* la lumière vient d'en haut à gauche : le reflet glisse à mesure que la carte tourne */
    const turn = ((y % 360) + 360) % 360, back = turn > 90 && turn < 270, a = ((back ? turn - 180 : turn > 180 ? turn - 360 : turn) * Math.PI) / 180;
    el.style.setProperty('--hx', (50 - Math.sin(a) * 62).toFixed(1) + '%');
    el.style.setProperty('--hy', (50 + (x / 34) * 46).toFixed(1) + '%');
    el.style.setProperty('--glint', (0.25 + 0.75 * Math.abs(Math.sin(a * 1.5 + x / 40))).toFixed(3));
    el.classList.toggle('turned', back);
  }
  function tick(now) {
    if (closed) return;
    const dt = Math.min(48, now - last) / 16.67;
    last = now;
    if (!drag) {
      if (target !== null) {
        /* un ressort amène la carte sur la face demandée */
        const d = target - ry;
        vy += d * 0.02 * dt; vy *= Math.pow(0.82, dt);
        ry += vy * dt;
        vx += (4 - rx) * 0.02 * dt; vx *= Math.pow(0.8, dt); rx += vx * dt;
        if (Math.abs(d) < 0.15 && Math.abs(vy) < 0.05) { ry = target; target = null; vy = 0; idle = now; }
      } else {
        /* l'élan s'épuise ; puis, au repos, un lent balancement fait vivre les reflets */
        ry += vy * dt; rx = clamp(rx + vx * dt, -34, 34);
        vy *= Math.pow(0.955, dt); vx *= Math.pow(0.9, dt);
        if (Math.abs(vy) < 0.02 && Math.abs(vx) < 0.02) {
          if (!idle) idle = now;
          const t = (now - idle) / 1000;
          tiltY = Math.sin(t * 0.9) * 7 * Math.min(1, t / 1.5); tiltX = Math.cos(t * 0.7) * 3 * Math.min(1, t / 1.5);
        } else { idle = 0; tiltY *= 0.9; tiltX *= 0.9; }
      }
    }
    draw();
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  function down(e) {
    if (e.target.closest('button')) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, moved: 0 };
    target = null; idle = 0; tiltY = 0; tiltX = 0; vy = 0; vx = 0;
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* pas grave */ }
    box.classList.add('held');
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y, dt = Math.max(1, e.timeStamp - drag.t);
    /* un demi-tour pour un peu moins que la largeur de la carte */
    const k = 180 / Math.max(160, el.getBoundingClientRect().width * 0.9);
    ry += dx * k; rx = clamp(rx - dy * k * 0.5, -34, 34);
    vy = (dx * k) / dt * 16.67; vx = (-dy * k * 0.5) / dt * 16.67;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX; drag.y = e.clientY; drag.t = e.timeStamp;
  }
  function up(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const tapped = drag.moved < 6;
    drag = null;
    box.classList.remove('held');
    vy = clamp(vy, -38, 38);
    /* un simple toucher retourne la carte */
    if (tapped && e.target.closest('.insp-card')) flip();
  }
  /** Retourne la carte : elle va se poser sur l'autre face. */
  function flip() {
    const turn = Math.round(ry / 180);
    target = (turn + 1) * 180;
    idle = 0; tiltY = 0; tiltX = 0;
    sfx.flip(1);
  }
  /* pencher le téléphone fait jouer les reflets (quand l'appareil le permet) */
  let base = null;
  function orient(e) {
    if (e.gamma == null || e.beta == null || drag) return;
    if (!base) base = { g: e.gamma, b: e.beta };
    tiltY = clamp((e.gamma - base.g) * 0.9, -28, 28); tiltX = clamp(-(e.beta - base.b) * 0.6, -18, 18);
    idle = performance.now() + 1e9;
  }
  const gyroBtn = box.querySelector('[data-act="gyro"]');
  const Dev = window.DeviceOrientationEvent;
  if (Dev && matchMedia('(pointer: coarse)').matches) {
    if (typeof Dev.requestPermission === 'function') gyroBtn.hidden = false;
    else window.addEventListener('deviceorientation', orient);
  }
  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('deviceorientation', orient);
    document.removeEventListener('keydown', key);
    document.body.style.overflow = scroll;
    box.classList.add('out');
    setTimeout(() => box.remove(), 220);
    if (opts.onClose) opts.onClose();
  }
  function key(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
    else if (e.key === 'ArrowLeft') vy = -9;
    else if (e.key === 'ArrowRight') vy = 9;
  }
  stage.addEventListener('pointerdown', down);
  stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  document.addEventListener('keydown', key, true);
  box.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'close') close();
    else if (act.dataset.act === 'flip') flip();
    else if (act.dataset.act === 'gyro') {
      Dev.requestPermission().then((state) => { if (state === 'granted') { window.addEventListener('deviceorientation', orient); gyroBtn.hidden = true; } }).catch(() => { gyroBtn.hidden = true; });
    }
  });
  return { close };
}
