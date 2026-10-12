/* Le réglage du son : deux curseurs — la musique de fond et les effets sonores — dans un petit panneau qu'ouvrent le bouton ♪ de l'en-tête
   et le bouton son des écrans de jeu (draft, partie, ouverture d'un pack). Un curseur à zéro coupe ; toucher le pictogramme d'une ligne
   coupe ou remet, sans perdre le réglage. Tout est gardé dans ce navigateur (music.js, sound.js). */
import { musicLevel, musicOn, setMusic, setMusicLevel } from './music.js';
import { setSound, setSoundLevel, sfx, soundLevel, soundOn } from './sound.js';

const icon = (id) => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + id + '"/></svg>';
const ROWS = [
  { key: 'music', name: 'Musique', sym: ['i-note', 'i-note'], on: musicOn, level: musicLevel, set: setMusic, setLevel: setMusicLevel },
  { key: 'sfx', name: 'Effets', sym: ['i-sound', 'i-mute'], on: soundOn, level: soundLevel, set: setSound, setLevel: setSoundLevel },
];
let box = null, owner = null, notify = null;

function draw() {
  for (const row of ROWS) {
    const el = box.querySelector('[data-row="' + row.key + '"]'), live = row.on(), value = Math.round(row.level() * 100);
    const button = el.querySelector('button'), range = el.querySelector('input');
    el.classList.toggle('off', !live);
    button.innerHTML = icon(row.sym[live ? 0 : 1]);
    button.setAttribute('aria-pressed', String(live));
    if (Number(range.value) !== value) range.value = String(value);
    range.style.setProperty('--v', value + '%');
    el.querySelector('output').textContent = live ? value + ' %' : 'coupé';
  }
}
/* le panneau s'ouvre sous son bouton, ou au-dessus quand le bouton est en bas de l'écran ; il ne déborde jamais */
function place() {
  if (!box || !owner) return;
  const r = owner.getBoundingClientRect(), w = Math.min(290, window.innerWidth - 16);
  box.style.width = w + 'px';
  box.style.left = Math.round(Math.min(window.innerWidth - w - 8, Math.max(8, r.right - w))) + 'px';
  if (r.top > window.innerHeight / 2) { box.style.top = 'auto'; box.style.bottom = Math.round(window.innerHeight - r.top + 10) + 'px'; }
  else { box.style.bottom = 'auto'; box.style.top = Math.round(r.bottom + 10) + 'px'; }
}
function outside(e) {
  if (!box) return;
  if (!document.body.contains(owner) || (!box.contains(e.target) && !owner.contains(e.target))) closeVolume();
}
function onKey(e) {
  if (e.key !== 'Escape' || !box) return;
  /* Échap ne ferme que le panneau, pas l'écran qui est dessous */
  e.stopPropagation();
  e.preventDefault();
  closeVolume();
}
const rowOf = (node) => { const el = node.closest('[data-row]'); return el ? ROWS.find((r) => r.key === el.dataset.row) : null; };

export const volumeOpen = () => !!box;
export function closeVolume() {
  if (!box) return;
  box.remove();
  box = null;
  if (owner) owner.classList.remove('open');
  owner = null; notify = null;
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('keydown', onKey, true);
  window.removeEventListener('resize', place);
  window.removeEventListener('hashchange', closeVolume);
}
/** Ouvre le réglage du son près du bouton donné, ou le referme s'il y est déjà. changed : appelé à chaque changement (pour redessiner le bouton). */
export function toggleVolume(button, changed) {
  if (box && owner === button) { closeVolume(); return; }
  closeVolume();
  owner = button; notify = changed || null;
  owner.classList.add('open');
  box = document.createElement('div');
  box.className = 'vol';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Réglage du son');
  box.innerHTML = ROWS.map((row) => '<div class="vol-row" data-row="' + row.key + '"><button type="button" aria-label="Couper ou remettre : ' + row.name.toLowerCase() + '"></button>'
    + '<span>' + row.name + '</span><output></output><input type="range" min="0" max="100" step="1" aria-label="Volume : ' + row.name.toLowerCase() + '"></div>').join('');
  document.body.appendChild(box);
  draw();
  place();
  box.addEventListener('input', (e) => {
    const row = rowOf(e.target);
    if (!row) return;
    row.setLevel(Number(e.target.value) / 100);
    draw();
    if (notify) notify();
  });
  /* un son témoin quand on lâche le curseur des effets */
  box.addEventListener('change', (e) => { const row = rowOf(e.target); if (row && row.key === 'sfx') sfx.click(); });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button'), row = b && rowOf(b);
    if (!row) return;
    row.set(!row.on());
    draw();
    if (row.key === 'sfx') sfx.click();
    if (notify) notify();
  });
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', place);
  window.addEventListener('hashchange', closeVolume);
}
