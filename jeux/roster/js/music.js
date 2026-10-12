/* La musique de fond : deux morceaux d'ambiance qui s'enchaînent en boucle, à faible volume.
   Elle ne part qu'après un premier geste du joueur (les navigateurs l'exigent), se fait toute petite pendant une partie ou l'ouverture d'un
   pack (leurs sons passent devant), se tait quand une autre musique joue, et se coupe d'un bouton : le choix est retenu d'une visite à l'autre.
   Morceaux : « For Originz » et « Ascending the Vale », Kevin MacLeod (incompetech.com), licence Creative Commons Attribution 4.0. */
import { STORE } from './config.js';

const TRACKS = ['musique/accueil-1.mp3', 'musique/accueil-2.mp3'];
const VOLUME = 0.16, QUIET = 0.05;
let audio = null, on = true, started = false, index = 0, goal = VOLUME, fade = 0, watch = 0;
try { on = localStorage.getItem(STORE + 'musique') !== '0'; } catch (e) { on = true; }

export const musicOn = () => on;

/** Amène doucement le volume à « to » ; à zéro, la lecture se met en pause si la musique est coupée. */
function ramp(to) {
  clearInterval(fade);
  fade = setInterval(() => {
    const gap = to - audio.volume;
    if (Math.abs(gap) < 0.012) {
      audio.volume = to;
      clearInterval(fade);
      if (to === 0 && !on) audio.pause();
    } else audio.volume = Math.min(1, Math.max(0, audio.volume + Math.sign(gap) * 0.01));
  }, 60);
}
function play() {
  if (!audio.src || audio.ended) audio.src = TRACKS[index];
  audio.play().then(() => ramp(goal)).catch(() => { /* le navigateur attend encore un geste : on réessaiera au prochain */ started = false; });
}
/* ce qui se passe à l'écran décide du volume : une autre musique (le lecteur de l'ouverture d'un pack) la fait taire,
   une partie ou une ouverture de pack la mettent en sourdine */
function mood() {
  const next = document.querySelector('.op-song') ? 0 : document.querySelector('.mv, .op, .dr') ? QUIET : VOLUME;
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
  mood();
  play();
}
/** Coupe ou remet la musique ; le choix est gardé. */
export function setMusic(value) {
  on = !!value;
  try { localStorage.setItem(STORE + 'musique', on ? '1' : '0'); } catch (e) { /* réglage non gardé */ }
  if (on) { if (started) play(); else startMusic(); } else if (audio) ramp(0);
}
