/* L'ouverture d'un pack.
   Le sachet se charge et éclate, les cinq cartes volent à leur place face cachée, puis le joueur les retourne dans l'ordre qu'il veut.
   Une All-Pro ou une MVP vient se montrer au centre de l'écran, précédée de trois indices.
   Le serveur a déjà tout décidé quand l'animation commence : ici, on ne fait que mettre en scène. */
import { GAME_NAME, ROLE_LABEL, TIER_COLOR } from './config.js';
import { cardHTML, esc, flagUrl, photoUrl } from './cards.js';
import { createFx } from './fx.js';
import { setSound, sfx, soundOn } from './sound.js';

const GOLD = ['#f0e6d2', '#c8aa6e', '#ffe7a8', '#ffffff'];
const PRISM = ['#ffe7a8', '#3fbfdd', '#ffffff', '#f4c874', '#9fe8ff'];
const tierColors = (tier) => (tier === 5 ? PRISM : tier >= 3 ? [TIER_COLOR[tier], '#ffffff', '#f0e6d2'] : [TIER_COLOR[tier], '#f0e6d2']);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const buzz = (pattern) => { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* pas de vibreur */ } };
const icon = (id) => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + id + '"/></svg>';

function packArt(season, size) {
  return '<div class="pack-art"><svg class="pack-mark" viewBox="0 0 100 100" aria-hidden="true"><use href="#mark"/></svg>'
    + '<div class="pack-name">' + esc(GAME_NAME) + '</div><div class="pack-line">Saison ' + season + '</div>'
    + '<div class="pack-chip">' + size + ' cartes</div><div class="pack-shine"></div></div>';
}
/** Le sachet, tel qu'il est montré sur l'accueil et au début de l'ouverture. */
export const packHTML = (cls, season, size) => '<div class="pack ' + (cls || '') + '">' + packArt(season, size) + '</div>';

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
    Si le serveur refuse, l'écran se referme et l'erreur est relancée telle quelle. */
export async function runOpening({ request, getCat, fx, size }) {
  let cat = getCat();
  const op = document.createElement('div');
  op.className = 'op';
  op.dataset.stage = 'charge';
  op.innerHTML = '<canvas class="op-fx"></canvas><div class="op-rays"></div><div class="op-flash"></div><div class="op-ring"></div>'
    + '<header class="op-head"><h2>Ouverture du pack</h2><span class="spacer"></span>'
    + '<button class="op-icon" type="button" data-act="sound" aria-label="Couper ou remettre le son"></button>'
    + '<button class="btn" type="button" data-act="all">Tout retourner</button></header>'
    + '<div class="op-stage"><div class="op-pack">' + packHTML('', cat.season, size) + '</div><div class="op-cards"></div></div>'
    + '<div class="op-veil"></div><div class="op-clues"></div><div class="op-label"></div><div class="op-tip">Touche pour continuer</div>'
    + '<footer class="op-foot"><p class="op-info"></p><div class="actions">'
    + '<button class="btn primary big" type="button" data-go="">Continuer</button><button class="btn big" type="button" data-go="collection">Ma collection</button></div></footer>';
  const $ = (sel) => op.querySelector(sel);
  const stageEl = $('.op-stage'), cardsEl = $('.op-cards'), info = $('.op-info'), label = $('.op-label'), clues = $('.op-clues');
  const scroll = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(op);
  const particles = createFx($('.op-fx'));
  if (fx) particles.ambient(true, GOLD);

  let pulls = [], busy = true, goTo = null, leave = null, revealingAll = false;
  const revealed = new Set();
  const stage = (name) => { op.dataset.stage = name; };
  const center = () => { const r = stageEl.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  const setBeam = (tier) => { op.style.setProperty('--beam', tier >= 3 ? TIER_COLOR[tier] : '#c8aa6e'); op.dataset.tier = tier; };
  const setInfo = (html, pulse) => { info.innerHTML = html; info.classList.toggle('pulse', !!pulse); };
  const soundBtn = $('[data-act="sound"]');
  const drawSound = () => { soundBtn.innerHTML = icon(soundOn() ? 'i-sound' : 'i-mute'); soundBtn.classList.toggle('off', !soundOn()); };
  drawSound();
  function close() {
    document.removeEventListener('keydown', onKey);
    particles.destroy();
    op.remove();
    document.body.style.overflow = scroll;
  }

  /* ---------- 1. le sachet se charge pendant que le serveur tire les cartes ---------- */
  const c0 = center();
  op.style.setProperty('--cx', c0.x + 'px');
  op.style.setProperty('--cy', c0.y + 'px');
  if (fx) {
    particles.converge(c0.x, c0.y, { colors: GOLD.concat('#0ac8b9'), duration: 1.1, count: 80, radius: Math.min(window.innerWidth, window.innerHeight) * 0.44 });
    sfx.charge(1.2);
  }
  let data;
  try {
    [data] = await Promise.all([request(), wait(fx ? 1200 : 60)]);
  } catch (e) {
    close();
    throw e;
  }
  cat = getCat();
  pulls = data.pack.cards.map((p) => ({ qty: p.qty, isNew: p.isNew, card: cat.cardById.get(p.id) })).filter((p) => p.card);
  const best = Math.max(1, ...pulls.map((p) => p.card.tier));
  /* la lumière de l'éclatement annonce déjà la couleur de la meilleure carte */
  setBeam(best);
  await Promise.race([Promise.all(pulls.map((p) => preload(photoUrl(p.card)))), wait(1300)]);
  cardsEl.innerHTML = pulls.map((p, i) => '<div class="op-slot" data-i="' + i + '"><div class="flare"></div>'
    + cardHTML(p.card, cat, { back: true, eager: true, cls: 'is-back' })
    + (p.isNew ? '<span class="badge new">Nouvelle</span>' : '<span class="badge qty">×' + p.qty + '</span>') + '</div>').join('');
  const slots = Array.from(cardsEl.children);
  const cardOf = (i) => slots[i].querySelector('.card');

  op.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'sound') { setSound(!soundOn()); drawSound(); sfx.click(); return; }
    if (act && act.dataset.act === 'all') { revealAll(); return; }
    const go = e.target.closest('[data-go]');
    if (go && leave && op.dataset.stage === 'done') { goTo = go.dataset.go; leave(); return; }
    const slot = e.target.closest('.op-slot');
    if (!slot || busy || revealingAll || (op.dataset.stage !== 'reveal' && op.dataset.stage !== 'done')) return;
    const i = Number(slot.dataset.i);
    if (revealed.has(i)) inspect(i); else reveal(i);
  });
  function onKey(e) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (op.classList.contains('show') || busy || revealingAll) return;
    e.preventDefault();
    if (op.dataset.stage === 'done') { if (leave) leave(); return; }
    const next = slots.findIndex((s, i) => !revealed.has(i));
    if (next >= 0 && op.dataset.stage === 'reveal') reveal(next);
  }
  document.addEventListener('keydown', onKey);

  if (!fx) {
    /* animations coupées : on montre tout de suite le contenu du pack */
    slots.forEach((s, i) => { cardOf(i).classList.remove('is-back'); s.classList.add('done'); revealed.add(i); });
    finish();
  } else {
    /* ---------- 2. le sachet éclate ---------- */
    stage('burst');
    restart($('.op-flash'), 'go');
    restart($('.op-ring'), 'go');
    shatter();
    particles.burst(c0.x, c0.y, { count: 130, colors: tierColors(best).concat(GOLD), speed: [220, 980], life: [0.7, 1.7] });
    sfx.burst();
    buzz(40);
    await wait(480);

    /* ---------- 3. les cartes volent à leur place ---------- */
    stage('deal');
    const c = center();
    await Promise.all(slots.map((slot, i) => {
      const r = slot.getBoundingClientRect();
      const dx = c.x - (r.left + r.width / 2), dy = c.y - (r.top + r.height / 2);
      setTimeout(() => sfx.deal(i), i * 110);
      return cardOf(i).animate([
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.2) rotate(' + rnd(-30, 30) + 'deg)', opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { transform: 'none', opacity: 1 },
      ], { duration: 580, delay: i * 110, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'backwards' }).finished
        .then(() => particles.dust(r.left + r.width / 2, r.bottom - 6, { colors: GOLD }));
    }));
    stage('reveal');
    setInfo('Touche une carte pour la retourner', true);
    busy = false;
  }

  await new Promise((resolve) => { leave = resolve; });
  close();
  return { data, goTo };

  /* ---------- le sachet vole en éclats ---------- */
  function shatter() {
    const pack = $('.op-pack .pack'), art = pack.querySelector('.pack-art');
    const cols = 3, rows = 4, pts = [];
    for (let r = 0; r <= rows; r++) {
      pts.push([]);
      for (let col = 0; col <= cols; col++) {
        const inner = r > 0 && r < rows && col > 0 && col < cols;
        pts[r].push([(col / cols) * 100 + (inner ? rnd(-9, 9) : 0), (r / rows) * 100 + (inner ? rnd(-7, 7) : 0)]);
      }
    }
    const frag = document.createDocumentFragment();
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const a = pts[r][col], b = pts[r][col + 1], d = pts[r + 1][col], e = pts[r + 1][col + 1];
        const pair = Math.random() < 0.5 ? [[a, b, d], [b, e, d]] : [[a, b, e], [a, e, d]];
        for (const tri of pair) {
          const shard = document.createElement('div');
          shard.className = 'shard';
          shard.style.clipPath = 'polygon(' + tri.map((p) => p[0].toFixed(1) + '% ' + p[1].toFixed(1) + '%').join(',') + ')';
          shard.appendChild(art.cloneNode(true));
          frag.appendChild(shard);
          const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3 - 50, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3 - 50, far = rnd(2.2, 4.2);
          shard.animate([
            { transform: 'none', opacity: 1 },
            { transform: 'translate(' + (cx * far).toFixed(0) + '%,' + (cy * far * 0.8 - 20).toFixed(0) + '%) rotate(' + rnd(-240, 240).toFixed(0) + 'deg) scale(' + rnd(0.4, 0.9).toFixed(2) + ')', opacity: 0 },
          ], { duration: rnd(560, 900), easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' });
        }
      }
    }
    art.remove();
    pack.appendChild(frag);
  }

  /* ---------- retourner une carte ---------- */
  async function reveal(i) {
    if (busy || revealed.has(i)) return;
    busy = true;
    const { card } = pulls[i], el = cardOf(i), slot = slots[i];
    setBeam(card.tier);
    setInfo('', false);
    el.classList.add('arm');
    sfx.arm(card.tier);
    buzz(10);
    await wait(240);
    if (card.tier >= 4) {
      await showcase(i, true);
    } else {
      el.classList.remove('arm', 'is-back');
      el.animate([{ transform: 'none' }, { transform: 'translateY(-7%) scale(1.1)', offset: 0.42 }, { transform: 'none' }], { duration: 700, easing: 'ease-out' });
      restart(slot.querySelector('.flare'), 'go');
      const r = slot.getBoundingClientRect();
      particles.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 8 + card.tier * 12, colors: tierColors(card.tier), speed: [110, 340 + card.tier * 70], life: [0.5, 1.2] });
      sfx.flip(card.tier);
      buzz(card.tier >= 3 ? [15, 30, 20] : 8);
      await wait(card.tier >= 3 ? 620 : 420);
    }
    revealed.add(i);
    slot.classList.add('done');
    busy = false;
    if (revealed.size === pulls.length) finish();
    else if (!revealingAll) setInfo('Encore ' + (pulls.length - revealed.size) + (pulls.length - revealed.size > 1 ? ' cartes' : ' carte'), true);
  }
  async function revealAll() {
    if (busy || revealingAll || op.dataset.stage !== 'reveal') return;
    revealingAll = true;
    /* les plus belles en dernier */
    const order = slots.map((s, i) => i).filter((i) => !revealed.has(i)).sort((a, b) => pulls[a].card.tier - pulls[b].card.tier || a - b);
    for (const i of order) await reveal(i);
    revealingAll = false;
  }
  /* revoir en grand une carte déjà retournée */
  async function inspect(i) {
    if (busy) return;
    busy = true;
    setBeam(pulls[i].card.tier);
    await showcase(i, false);
    busy = false;
  }

  /* ---------- une carte vient se montrer au centre ---------- */
  async function showcase(i, first) {
    const { card } = pulls[i], el = cardOf(i), slot = slots[i];
    const r = slot.getBoundingClientRect();
    const width = Math.min(window.innerWidth * 0.72, 340, window.innerHeight * 0.44), scale = width / r.width;
    const dx = window.innerWidth / 2 - (r.left + r.width / 2), dy = window.innerHeight / 2 - (r.top + r.height / 2);
    const big = 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ')';
    slot.classList.add('lift');
    op.classList.add('show');
    op.classList.toggle('rays', card.tier >= 3);
    sfx.whoosh();
    const up = el.animate([{ transform: 'none' }, { transform: big }], { duration: 430, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    await up.finished;
    if (first) {
      $('.op-tip').style.visibility = 'hidden';
      /* trois indices, puis la carte */
      sfx.rise(1.75);
      const hints = [
        card.country ? '<span><img src="' + flagUrl(card.country) + '" alt="">' + esc(cat.countries[card.country]) + '</span>' : '',
        '<span>' + ROLE_LABEL[card.role] + '</span>', '<span>' + esc(card.league) + '</span>',
      ].filter(Boolean);
      for (let k = 0; k < hints.length; k++) {
        clues.insertAdjacentHTML('beforeend', hints[k]);
        sfx.clue(k);
        buzz(12);
        await wait(470);
      }
      await wait(330);
      clues.innerHTML = '';
      if (card.tier === 5) el.classList.add('slow');
      el.classList.remove('arm', 'is-back');
      restart($('.op-flash'), 'go');
      label.textContent = cat.tierById.get(card.tier).name;
      restart(label, 'go');
      particles.burst(window.innerWidth / 2, window.innerHeight / 2, { count: card.tier === 5 ? 190 : 120, colors: tierColors(card.tier), speed: [240, 1050], life: [0.8, 2] });
      particles.fountain(window.innerWidth / 2, window.innerHeight / 2 + width * 0.7, { colors: tierColors(card.tier), waves: card.tier === 5 ? 9 : 5 });
      sfx.flip(card.tier);
      buzz([30, 50, 40]);
      await wait(card.tier === 5 ? 1300 : 850);
      $('.op-tip').style.visibility = '';
    }
    /* un toucher n'importe où renvoie la carte à sa place */
    await new Promise((resolve) => {
      const done = (e) => { e.stopPropagation(); op.removeEventListener('click', done, true); document.removeEventListener('keydown', key, true); resolve(); };
      const key = (e) => { if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); done(e); } };
      setTimeout(() => { op.addEventListener('click', done, true); document.addEventListener('keydown', key, true); }, 80);
    });
    sfx.whoosh();
    label.classList.remove('go');
    label.textContent = '';
    op.classList.remove('show', 'rays');
    const down = el.animate([{ transform: big }, { transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
    await down.finished;
    up.cancel();
    down.cancel();
    slot.classList.remove('lift');
  }

  /* ---------- bilan ---------- */
  function finish() {
    const fresh = pulls.filter((p) => p.isNew).length;
    stage('done');
    setBeam(best);
    setInfo('<b>' + (fresh ? fresh + (fresh > 1 ? ' nouvelles cartes' : ' nouvelle carte') : 'Aucune nouvelle carte') + '</b>', false);
    if (fx) sfx.done();
    busy = false;
  }
}
