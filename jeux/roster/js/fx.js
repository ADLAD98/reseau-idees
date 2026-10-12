/* Effets de particules dessinés sur un canevas : poussière d'or, éclats, étincelles.
   Le dessin ne tourne que lorsqu'il reste quelque chose à montrer. */

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function createFx(canvas) {
  const ctx = canvas.getContext('2d');
  let parts = [], raf = 0, last = 0, w = 0, h = 0, dpr = 1, motes = 0;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  function add(p) {
    parts.push(Object.assign({ vx: 0, vy: 0, g: 0, drag: 1, rot: rnd(0, 6.28), spin: rnd(-4, 4), delay: 0, seed: rnd(0, 100), shape: 'dot' }, p, { max: p.life }));
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      const damp = Math.pow(p.drag, dt * 60);
      if (p.tx !== undefined) { p.vx += (p.tx - p.x) * p.pull * dt; p.vy += (p.ty - p.y) * p.pull * dt; }
      p.vx *= damp; p.vy = p.vy * damp + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
      const k = p.life / p.max;
      const size = p.size * (p.shrink ? 0.35 + 0.65 * k : 1);
      ctx.globalAlpha = Math.min(1, k * 2.4) * (p.alpha || 1) * (p.twinkle ? 0.55 + 0.45 * Math.sin(now / 90 + p.seed) : 1);
      ctx.fillStyle = p.color;
      if (p.shape === 'spark') {
        /* un trait étiré dans le sens du mouvement */
        const len = Math.min(30, Math.hypot(p.vx, p.vy) * 0.05) + size;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx)); ctx.fillRect(-len, -size / 3, len, size / 1.5); ctx.restore();
      } else if (p.shape === 'diamond') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-size / 2, -size / 2, size, size); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, size / 2, 0, 6.2832); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    raf = parts.length ? requestAnimationFrame(tick) : 0;
  }

  return {
    /** Explosion autour d'un point. */
    burst(x, y, o = {}) {
      const colors = o.colors || ['#ffffff'], shapes = o.shapes || ['dot', 'diamond', 'spark'];
      const [s0, s1] = o.speed || [160, 620], [l0, l1] = o.life || [0.6, 1.5], [z0, z1] = o.size || [2, 5.5];
      const spread = o.spread === undefined ? Math.PI * 2 : o.spread, angle = o.angle || 0;
      for (let i = 0; i < (o.count || 60); i++) {
        const a = angle + rnd(-spread / 2, spread / 2), v = rnd(s0, s1);
        add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: o.gravity === undefined ? 240 : o.gravity, drag: o.drag || 0.94,
          life: rnd(l0, l1), size: rnd(z0, z1), color: pick(colors), shape: pick(shapes), shrink: true, twinkle: Math.random() < 0.4 });
      }
    },
    /** Des particules qui convergent vers un point : le sachet qui se charge. */
    converge(x, y, o = {}) {
      const colors = o.colors || ['#ffffff'], duration = o.duration || 1.1, r = o.radius || 260;
      for (let i = 0; i < (o.count || 70); i++) {
        const a = rnd(0, 6.28), d = rnd(r * 0.55, r * 1.15);
        add({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a + 1.6) * rnd(40, 140), vy: Math.sin(a + 1.6) * rnd(40, 140),
          tx: x, ty: y, pull: rnd(9, 16), drag: 0.9, delay: rnd(0, duration * 0.75), life: rnd(0.45, 0.8), size: rnd(1.6, 4), color: pick(colors),
          shape: Math.random() < 0.5 ? 'diamond' : 'dot', shrink: true });
      }
    },
    /** Une gerbe vers le haut, pour une très belle carte. */
    fountain(x, y, o = {}) {
      for (let k = 0; k < (o.waves || 5); k++) {
        setTimeout(() => this.burst(x + rnd(-30, 30), y, Object.assign({ count: 26, angle: -Math.PI / 2, spread: 1.5, speed: [380, 880], gravity: 620, life: [1, 2], size: [2.5, 6] }, o)), k * 150);
      }
    },
    /** Un peu de poussière qui retombe : une carte qui se pose. */
    dust(x, y, o = {}) {
      this.burst(x, y, Object.assign({ count: 10, angle: -Math.PI / 2, spread: 2.6, speed: [40, 150], gravity: 120, life: [0.35, 0.8], size: [1.4, 3], shapes: ['dot'] }, o));
    },
    /** Des grains de lumière qui montent lentement, en fond. */
    ambient(on, colors = ['#c8aa6e']) {
      clearInterval(motes);
      motes = 0;
      if (!on) return;
      motes = setInterval(() => {
        if (document.hidden || parts.length > 260) return;
        add({ x: rnd(0, w), y: h + 8, vx: rnd(-12, 12), vy: rnd(-46, -18), life: rnd(5, 9), size: rnd(1, 2.6), color: pick(colors), twinkle: true, alpha: 0.55,
          shape: Math.random() < 0.35 ? 'diamond' : 'dot' });
      }, 170);
    },
    clear() { parts = []; },
    destroy() { clearInterval(motes); parts = []; if (raf) cancelAnimationFrame(raf); raf = 0; window.removeEventListener('resize', resize); },
  };
}
