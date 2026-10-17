/* Le tutoriel de la première partie, pour un nouveau joueur : un halo autour du bon bouton et une bulle qui dit quoi faire, en cinq
   étapes — ouvrir son premier pack, aller sur Jouer, découvrir son équipe (alignée d'office), choisir un adversaire, laisser son coach
   faire la draft — jusqu'au premier match joué. Il suit ce que le joueur fait (rien n'est bloqué) et se tait pendant l'ouverture d'un
   pack, la partie ou une fenêtre qui n'est pas la sienne. « Passer le tutoriel » l'arrête pour de bon. Seulement pour un compte de moins
   de quatorze jours qui n'a encore joué aucun match ; où il en est se garde dans ce navigateur. */
import { STORE } from './config.js';

let G = null, timer = 0, ring = null, bubble = null, shown = '', current = null, scrolled = '';
const NUMBER = { pack: 1, back: 1, play: 2, team: 3, foe: 4, sim: 5, go: 5, draft: 5 };
const key = () => STORE + 'tuto-' + (G && G.S.player ? G.S.player.id : 0);
const load = () => { try { return JSON.parse(localStorage.getItem(key()) || '{}') || {}; } catch (e) { return {}; } };
const save = (st) => { try { localStorage.setItem(key(), JSON.stringify(st)); } catch (e) { /* il reprendra du début */ } };
const visible = (el) => !!el && el.getClientRects().length > 0;
const first = (sel) => [...document.querySelectorAll(sel)].find(visible) || null;
const page = () => location.hash.replace(/^#\/?/, '').split('/')[0] || 'packs';
/* l'onglet d'une page : dans la barre du haut sur ordinateur, dans celle du bas sur téléphone */
const tab = (name) => first('.top .nav [data-tab="' + name + '"]') || first('.tabs [data-tab="' + name + '"]');

/** À appeler une fois le joueur connecté (app.js, shell) : le tutoriel suit ensuite tout seul. */
export function startTutorial(ctx) {
  G = ctx;
  if (!timer) {
    timer = setInterval(tick, 350);
    addEventListener('resize', tick);
    addEventListener('scroll', tick, { passive: true });
    document.addEventListener('click', onClick);
  }
  tick();
}

/* l'étape du moment, ou rien */
function step() {
  const p = G && G.S.player, st = load();
  if (!p || st.done || st.skip) return null;
  const games = (p.wins || 0) + (p.losses || 0);
  if (games >= 1) {
    /* le premier match est joué : un mot, une seule fois, et c'est fini */
    if (st.started) G.toast('Premier match joué, bravo ! Missions, défis et événement t\'attendent sur l\'écran Packs.');
    save({ ...st, done: 1 });
    return null;
  }
  if (Date.now() - (p.createdAt || 0) > 14 * 86400000) return null;
  /* l'ouverture d'un pack, la partie, une fiche de carte, le code de secours, le volume : on se tait */
  if (document.querySelector('.op, .mv, .insp, .rc-box, .vol')) return null;
  const sheet = document.querySelector('.sheet');
  if (sheet) {
    const sim = sheet.querySelector('#goSim'), go = sheet.querySelector('#go');
    if (sim) return { id: 'sim', el: sim, text: 'Pour ton premier match, laisse ton coach faire la draft : « Simuler la draft » lance directement la partie.' };
    if (go) return { id: 'go', el: go, text: 'Lance la draft : chaque équipe choisit ses champions, puis la partie se joue.' };
    return null;
  }
  if (document.querySelector('.dr')) {
    const t = first('.dr-sim') || first('.dr-auto');
    return t ? { id: 'draft', el: t, text: 'La draft : chaque équipe choisit ses champions à tour de rôle. Pour cette fois, laisse ton coach finir : « Simuler ».' } : null;
  }
  if (!(p.packsOpened > 0)) {
    if (page() !== 'packs') return { id: 'back', el: tab('packs'), text: 'Ton premier pack t\'attend sur l\'écran Packs.' };
    return { id: 'pack', el: first('#openPack'), text: 'Bienvenue sur Roster ! Ouvre ton premier pack : des cartes de vrais joueurs pros.' };
  }
  if (page() !== 'jouer') return { id: 'play', el: tab('jouer'), text: 'Tes cartes forment déjà une équipe. Va sur « Jouer » pour ton premier match.' };
  if (!G.S.play) return null;
  if (!st.team) return { id: 'team', el: first('.squad'), text: 'Voici ton équipe : la meilleure possible avec tes cartes. Plus tard, touche une carte pour la changer.', next: 'Compris' };
  /* l'adversaire le plus faible de la liste affichée (un nouveau joueur n'en a souvent aucun « Abordable ») */
  const foes = (G.S.play.opponents || []).filter((o) => document.querySelector('#foes [data-foe="' + o.id + '"]')).sort((a, b) => a.rating - b.rating);
  const weakest = foes[0] ? first('#foes [data-foe="' + foes[0].id + '"]') : first('#foes .foe');
  return { id: 'foe', el: weakest, text: 'Commence par l\'adversaire le plus faible de la liste : ta première victoire contre une équipe rapporte un pack.' };
}

function tick() {
  const s = step();
  if (!s || !s.el) { hide(); return; }
  current = s;
  const st = load();
  if (!st.started) save({ ...st, started: 1 });
  if (!ring) {
    ring = document.createElement('div'); ring.className = 'tuto-ring'; ring.setAttribute('aria-hidden', 'true');
    bubble = document.createElement('div'); bubble.className = 'tuto-bubble'; bubble.setAttribute('role', 'status');
    document.body.append(ring, bubble);
  }
  ring.hidden = false; bubble.hidden = false;
  if (shown !== s.id) {
    shown = s.id;
    bubble.innerHTML = '<span class="tuto-n">Premiers pas · ' + NUMBER[s.id] + ' / 5</span><p>' + s.text + '</p><div class="tuto-act">'
      + (s.next ? '<button class="btn primary" type="button" data-tuto="next">' + s.next + '</button>' : '')
      + '<button class="tuto-skip" type="button" data-tuto="skip">Passer le tutoriel</button></div>';
  }
  /* le bouton montré doit être à l'écran : on y descend une fois par étape */
  let r = s.el.getBoundingClientRect();
  const top = document.querySelector('.top'), barH = top ? top.getBoundingClientRect().bottom : 0;
  const tabs = first('.tabs'), bottomH = tabs ? innerHeight - tabs.getBoundingClientRect().top : 0;
  const inBar = !!s.el.closest('.top, .tabs');
  if (!inBar && scrolled !== s.id && (r.top < barH || r.bottom > innerHeight - bottomH)) {
    scrolled = s.id;
    s.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  r = s.el.getBoundingClientRect();
  const pad = 6;
  Object.assign(ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + 2 * pad + 'px', height: r.height + 2 * pad + 'px' });
  /* la bulle : sous le bouton s'il y a la place, sinon au-dessus ; un bloc plus grand que l'écran (son équipe) : en haut, sous la barre,
     loin des messages du jeu qui s'affichent en bas ; jamais hors de l'écran */
  const w = Math.min(340, innerWidth - 32), h = bubble.offsetHeight || 120;
  const below = r.bottom + pad + 12, above = r.top - pad - 12 - h;
  const tall = r.height > (innerHeight - barH - bottomH) * 0.6;
  const y = tall ? barH + 12 : below + h <= innerHeight - bottomH - 8 ? below : above >= barH + 8 ? above : Math.max(barH + 8, innerHeight - bottomH - h - 8);
  const x = Math.min(innerWidth - w - 16, Math.max(16, r.left + r.width / 2 - w / 2));
  Object.assign(bubble.style, { width: w + 'px', left: x + 'px', top: y + 'px' });
}

function hide() {
  current = null;
  if (ring) { ring.hidden = true; bubble.hidden = true; }
  shown = '';
}

function onClick(e) {
  const b = e.target.closest('[data-tuto]');
  if (!b) return;
  const st = load();
  if (b.dataset.tuto === 'skip') { save({ ...st, skip: 1 }); hide(); return; }
  if (b.dataset.tuto === 'next' && current && current.id === 'team') { save({ ...st, team: 1 }); tick(); }
}
