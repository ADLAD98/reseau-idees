/* L'ouverture d'un pack : le sachet se charge, se déchire, puis chaque carte se retourne une à une.
   Le serveur a déjà tout décidé quand l'animation commence : ici, on ne fait que mettre en scène. */
import { GAME_NAME, ROLE_LABEL } from './config.js';
import { artUrl, cardHTML, esc, flagUrl } from './cards.js';

const TIER_COLOR = { 1: '#93a1b0', 2: '#00e5ff', 3: '#ffd60a', 4: '#d08bff', 5: '#ffffff' };
const PRISM = ['#00e5ff', '#b388ff', '#ff2a6d', '#ffd60a', '#39ff9f', '#ffffff'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Le sachet, en deux moitiés superposées pour pouvoir le déchirer. */
export function packHTML(cls, season, size) {
  const art = '<div class="pack-art"><svg class="pack-mark" viewBox="0 0 100 100" aria-hidden="true"><use href="#mark"/></svg>'
    + '<div class="pack-name">' + esc(GAME_NAME) + '</div><div class="pack-line">Saison ' + season + '</div>'
    + '<div class="pack-chip">' + size + ' cartes</div><div class="pack-shine"></div></div>';
  return '<div class="pack ' + (cls || '') + '"><div class="pack-half pack-up">' + art + '</div><div class="pack-half pack-down">' + art + '</div></div>';
}

function preload(url) {
  return new Promise((resolve) => {
    if (!url) return resolve();
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = url;
  });
}
const buzz = (pattern) => { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* pas de vibreur */ } };

/** Joue l'ouverture. request() appelle le serveur ; renvoie { data, goTo } une fois le bilan fermé.
    getCat() donne le catalogue : il est relu après la réponse du serveur, au cas où il viendrait d'être mis à jour.
    Si le serveur refuse, l'écran se referme et l'erreur est relancée telle quelle. */
export async function runOpening({ request, getCat, fx, size }) {
  let cat = getCat();
  const op = document.createElement('div');
  op.className = 'op';
  op.dataset.stage = 'charge';
  op.innerHTML = '<div class="op-rays"></div><div class="op-flash"></div>'
    + '<div class="op-center"><div class="op-pack">' + packHTML('', cat.season, size) + '<div class="op-glow"></div><div class="op-beam"></div></div>'
    + '<div class="op-sparks"></div><div class="op-slot"></div></div>'
    + '<div class="op-clues"></div><div class="op-label"></div>'
    + '<div class="op-under"><div class="op-tagbox"></div><div class="op-hint"></div></div>'
    + '<div class="op-tray"></div><div class="op-end"></div>'
    + '<button class="btn op-skip" type="button">Passer</button>';
  const $ = (sel) => op.querySelector(sel);
  const slot = $('.op-slot'), clues = $('.op-clues'), label = $('.op-label'), tagbox = $('.op-tagbox'), hint = $('.op-hint'), tray = $('.op-tray'), end = $('.op-end');
  const scroll = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(op);

  /* « Passer » coupe court à toutes les attentes en cours et à venir */
  let skipped = false, wake = null;
  const pause = (ms) => (skipped ? Promise.resolve() : new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() { clearTimeout(timer); wake = null; resolve(); }
    wake = done;
  }));
  const tap = () => (skipped ? Promise.resolve() : new Promise((resolve) => {
    function done() { op.removeEventListener('click', done); wake = null; resolve(); }
    op.addEventListener('click', done);
    wake = done;
  }));
  const skip = () => { skipped = true; if (wake) wake(); };
  $('.op-skip').addEventListener('click', (e) => { e.stopPropagation(); skip(); });
  const onKey = (e) => {
    if (e.key === 'Escape') skip();
    else if ((e.key === ' ' || e.key === 'Enter') && wake && op.dataset.stage === 'reveal') { e.preventDefault(); wake(); }
  };
  document.addEventListener('keydown', onKey);
  const close = () => { document.removeEventListener('keydown', onKey); op.remove(); document.body.style.overflow = scroll; };
  const stage = (name) => { op.dataset.stage = name; };
  const flash = () => { const f = $('.op-flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); };
  const shake = () => { op.classList.remove('shake'); void op.offsetWidth; op.classList.add('shake'); };
  function sparks(tier) {
    const n = tier === 5 ? 36 : tier === 4 ? 24 : 14;
    const colors = tier === 5 ? PRISM : [TIER_COLOR[tier], '#ffffff'];
    let html = '';
    for (let k = 0; k < n; k++) {
      html += '<i style="--a:' + Math.round((360 * k) / n + Math.random() * 14) + 'deg;--r:' + Math.round(150 + Math.random() * 240) + 'px;--d:'
        + (0.7 + Math.random() * 0.7).toFixed(2) + 's;--sc:' + colors[k % colors.length] + '"></i>';
    }
    $('.op-sparks').innerHTML = html;
  }

  let data;
  try {
    [data] = await Promise.all([request(), wait(fx ? 1500 : 120)]);
  } catch (e) {
    close();
    throw e;
  }
  cat = getCat();
  const pulls = data.pack.cards.map((p) => ({ qty: p.qty, isNew: p.isNew, card: cat.cardById.get(p.id) })).filter((p) => p.card);
  const best = Math.max(1, ...pulls.map((p) => p.card.tier));
  /* la lumière qui sort du sachet annonce déjà la couleur de la meilleure carte */
  op.style.setProperty('--beam', TIER_COLOR[best]);
  op.dataset.tier = best;
  await Promise.race([Promise.all(pulls.map((p) => preload(artUrl(p.card)))), wait(1500)]);

  if (fx) {
    stage('burst');
    flash();
    buzz(30);
    if (best >= 3) op.classList.add('rays');
    await wait(1050);
    op.classList.remove('rays');
    stage('reveal');
    tray.innerHTML = pulls.map(() => '<div class="ph"></div>').join('');
    for (let i = 0; i < pulls.length && !skipped; i++) await reveal(i);
  }

  /* bilan */
  const fresh = pulls.filter((p) => p.isNew).length;
  stage('end');
  op.style.setProperty('--beam', TIER_COLOR[best]);
  op.dataset.tier = best;
  op.classList.toggle('rays', fx && best >= 4);
  end.innerHTML = '<h2>' + (fresh ? fresh + (fresh > 1 ? ' nouvelles cartes' : ' nouvelle carte') : 'Aucune nouvelle carte') + '</h2>'
    + '<div class="op-grid">' + pulls.map((p, i) => '<div class="tile" style="--i:' + i + '">' + cardHTML(p.card, cat, { eager: true })
      + (p.isNew ? '<span class="badge new">Nouvelle</span>' : '<span class="badge qty">×' + p.qty + '</span>') + '</div>').join('') + '</div>'
    + '<div class="actions"><button class="btn solid big" type="button" data-go="">Continuer</button>'
    + '<button class="btn big" type="button" data-go="collection">Ma collection</button></div>';
  const goTo = await new Promise((resolve) => {
    end.addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]');
      if (b) resolve(b.dataset.go);
    });
  });
  close();
  return { data, goTo };

  async function reveal(i) {
    const { card, isNew, qty } = pulls[i];
    const tierName = cat.tierById.get(card.tier).name;
    op.style.setProperty('--beam', TIER_COLOR[card.tier]);
    op.dataset.tier = card.tier;
    op.classList.remove('rays');
    clues.innerHTML = ''; tagbox.innerHTML = ''; label.textContent = ''; label.classList.remove('go');
    $('.op-sparks').innerHTML = '';
    slot.innerHTML = cardHTML(card, cat, { back: true, eager: true, cls: 'is-back enter' });
    const el = slot.firstElementChild;
    slot.classList.add('bob');
    hint.textContent = i === pulls.length - 1 ? 'Carte bonus · touche pour la retourner' : i === 0 ? 'Touche la carte pour la retourner' : 'Carte ' + (i + 1) + ' sur ' + pulls.length;
    await tap();
    if (skipped) return;
    hint.textContent = '';
    slot.classList.remove('bob');

    /* grosse carte : on fait monter la tension avec trois indices avant de la montrer */
    if (card.tier >= 4) {
      op.classList.add('rays');
      el.classList.add('tease');
      const country = card.country ? '<span><img src="' + flagUrl(card.country) + '" alt="">' + esc(cat.countries[card.country]) + '</span>' : '';
      for (const clue of [country, '<span>' + ROLE_LABEL[card.role] + '</span>', '<span>' + esc(card.league) + '</span>']) {
        if (!clue) continue;
        clues.insertAdjacentHTML('beforeend', clue);
        buzz(15);
        await pause(560);
      }
      await pause(420);
      if (skipped) return;
      el.classList.remove('tease');
      clues.innerHTML = '';
    }

    if (card.tier === 5) el.classList.add('slow');
    el.classList.remove('is-back', 'enter');
    if (card.tier >= 3) {
      flash();
      sparks(card.tier);
      op.classList.add('rays');
      label.textContent = tierName;
      label.classList.add('go');
    }
    if (card.tier >= 4) shake();
    buzz(card.tier >= 3 ? [20, 40, 30] : 12);
    await pause(card.tier === 5 ? 1350 : 720);
    tagbox.innerHTML = isNew ? '<span class="op-tag">Nouvelle carte</span>' : '<span class="op-tag dup">Déjà possédée · ×' + qty + '</span>';
    hint.textContent = i === pulls.length - 1 ? 'Touche pour voir le bilan' : 'Touche pour continuer';
    await tap();
    if (tray.children[i]) tray.children[i].outerHTML = cardHTML(card, cat, { eager: true });
    if (skipped) return;
    el.classList.add('leave');
    await pause(240);
  }
}
