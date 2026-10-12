/* La musique de fond : deux morceaux d'ambiance qui s'enchaînent en boucle, à faible volume.
   Elle ne part qu'après un premier geste du joueur (les navigateurs l'exigent), se fait toute petite pendant une partie ou l'ouverture d'un
   pack (leurs sons passent devant), se tait quand une autre musique joue. Son volume se règle (volume.js) et elle se coupe : les deux
   choix sont retenus d'une visite à l'autre.
   Morceaux : « For Originz » et « Ascending the Vale », Kevin MacLeod (incompetech.com), licence Creative Commons Attribution 4.0. */
import { STORE } from './config.js';

const TRACKS = ['musique/accueil-1.mp3', 'musique/accueil-2.mp3'];
/* Le curseur du joueur va de 0 à 1 ; le volume réel suit son carré (l'oreille entend en proportion) : LOUD quand il est à fond, six fois
   moins au réglage d'origine. QUIET : la part qu'il en reste pendant une partie, une draft ou l'ouverture d'un pack. */
const LOUD = 0.3, DEFAULT = 0.4, QUIET = 0.3;
let audio = null, on = true, level = DEFAULT, started = false, index = 0, goal = 0, fade = 0, watch = 0;
try {
  on = localStorage.getItem(STORE + 'musique') !== '0';
  const saved = localStorage.getItem(STORE + 'volume');
  if (saved !== null && Number(saved) >= 0 && Number(saved) <= 100) level = Number(saved) / 100;
} catch (e) { on = true; }
if (level <= 0) on = false;
function save() {
  try { localStorage.setItem(STORE + 'musique', on ? '1' : '0'); localStorage.setItem(STORE + 'volume', String(Math.round(level * 100))); } catch (e) { /* réglage non gardé */ }
}

export const musicOn = () => on;
/** Le réglage du joueur, de 0 à 1 (gardé même quand la musique est coupée). */
export const musicLevel = () => level;
/** De combien le joueur a monté ou baissé la musique par rapport au réglage d'origine (1 : il n'y a pas touché) : les autres musiques du jeu suivent. */
export const musicScale = () => (on ? Math.min(3, Math.max(0.2, (level * level) / (DEFAULT * DEFAULT))) : 1);

/* le volume voulu à cet instant : ce qui se passe à l'écran en décide — une autre musique (le lecteur de l'ouverture d'un pack) la fait taire,
   une partie, une draft ou une ouverture de pack la mettent en sourdine */
const wanted = () => (!on ? 0 : document.querySelector('.op-song') ? 0 : LOUD * level * level * (document.querySelector('.mv, .op, .dr') ? QUIET : 1));
/** Amène doucement le volume à « to » ; à zéro, la lecture se met en pause si la musique est coupée. */
function ramp(to) {
  clearInterval(fade);
  fade = setInterval(() => {
    const gap = to - audio.volume;
    if (Math.abs(gap) < 0.003) {
      audio.volume = to;
      clearInterval(fade);
      if (to === 0 && !on) audio.pause();
    } else audio.volume = Math.min(1, Math.max(0, audio.volume + Math.sign(gap) * Math.max(0.002, Math.abs(gap) * 0.2)));
  }, 60);
}
function play() {
  if (!audio.src || audio.ended) audio.src = TRACKS[index];
  audio.play().then(() => ramp(goal)).catch(() => { /* le navigateur attend encore un geste : on réessaiera au prochain */ started = false; });
}
function mood() {
  const next = wanted();
  if (next === goal) return;
  goal = next;
  if (audio && on && started) ramp(goal);
}
/** À appeler au premier geste du joueur : lance la musique si elle n'est pas coupée. */
export function startMusic() {
  if (started || !on) return;
  started = true;
  if (!audio) {
    audio = new Audio();
    audio.preload = 'none';
    audio.volume = 0;
    index = Math.floor(Math.random() * TRACKS.length);
    audio.addEventListener('ended', () => { index = (index + 1) % TRACKS.length; audio.src = TRACKS[index]; play(); });
    /* la musique ne continue pas dans un onglet qu'on ne regarde plus */
    document.addEventListener('visibilitychange', () => { if (!on || !started) return; if (document.hidden) audio.pause(); else play(); });
  }
  if (!watch) watch = setInterval(mood, 600);
  goal = wanted();
  play();
}
/** Coupe ou remet la musique ; son volume est gardé. */
export function setMusic(value) {
  on = !!value;
  if (on && level <= 0) level = DEFAULT;
  save();
  goal = wanted();
  if (on) { if (started) play(); else startMusic(); } else if (audio) ramp(0);
}
/** Règle le volume de la musique, de 0 à 1 : à zéro elle est coupée ; au-dessus, elle joue, et le changement s'entend tout de suite. */
export function setMusicLevel(value) {
  level = Math.min(1, Math.max(0, Number(value) || 0));
  on = level > 0;
  save();
  goal = wanted();
  if (!on) { if (audio) ramp(0); return; }
  if (!started) { startMusic(); return; }
  clearInterval(fade);
  audio.volume = goal;
  if (audio.paused) play();
}
