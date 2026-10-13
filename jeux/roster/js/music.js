/* La musique de fond, à faible volume, selon ce qu'on fait : deux morceaux d'ambiance qui s'enchaînent dans les menus, un morceau tendu
   pendant la draft, une musique de bataille (écrite pour rester sous les voix) pendant la partie. On passe de l'une à l'autre en fondu, et
   chacune reprend là où on l'avait laissée. Quand la Karmine joue, une tribune de supporters gronde très loin derrière, et s'anime quand
   elle marque.
   La musique ne part qu'après un premier geste du joueur (les navigateurs l'exigent), se fait toute petite pendant l'ouverture d'un pack
   et se tait quand une autre musique joue. Son volume se règle (volume.js) et elle se coupe : les deux choix sont retenus.
   Morceaux : « For Originz », « Ascending the Vale », « Minima » et « Clash Defiant », Kevin MacLeod (incompetech.com), licence Creative
   Commons Attribution 4.0. Tribune : « Soccer fans screaming and playing drums in a small stadium of Chile », Félix Blume (freesound.org),
   versée au domaine public (CC0). */
import { STORE } from './config.js';

/* les morceaux de chaque moment du jeu, et la part du volume qu'ils prennent (ceux du jeu passent derrière ses sons et son commentaire) */
const SCENES = {
  home: { tracks: ['musique/accueil-1.mp3', 'musique/accueil-2.mp3'], gain: 1 },
  draft: { tracks: ['musique/draft.mp3'], gain: 0.8 },
  game: { tracks: ['musique/partie.mp3'], gain: 0.62 },
};
const CROWD = 'musique/tribune.mp3', CROWD_GAIN = 0.42;
/* Le curseur du joueur va de 0 à 1 ; le volume réel suit son carré (l'oreille entend en proportion) : LOUD quand il est à fond, six fois
   moins au réglage d'origine. QUIET : la part qu'il en reste pendant l'ouverture d'un pack. */
const LOUD = 0.3, DEFAULT = 0.4, QUIET = 0.3;
let audio = null, on = true, level = DEFAULT, started = false, goal = 0, fade = 0, watch = 0;
let scene = 'home', hush = false, switching = false;
const spot = { home: { index: 0, time: 0 }, draft: { index: 0, time: 0 }, game: { index: 0, time: 0 } };
let crowd = null, crowdTick = 0, swell = 0;
try {
  on = localStorage.getItem(STORE + 'musique') !== '0';
  const saved = localStorage.getItem(STORE + 'volume');
  if (saved !== null && Number(saved) >= 0 && Number(saved) <= 100) level = Number(saved) / 100;
} catch (e) { on = true; }
if (level <= 0) on = false;
function save() {
  try { localStorage.setItem(STORE + 'musique', on ? '1' : '0'); localStorage.setItem(STORE + 'volume', String(Math.round(level * 100))); } catch (e) { /* réglage non gardé */ }
}

/* ---------- le volume d'un lecteur ---------- */
/* Sur iPhone et iPad, le volume d'un lecteur audio ne se règle pas : il vaut toujours 1, et ce qu'un site y écrit est ignoré (seuls les
   boutons de l'appareil comptent). Sans précaution, la musique y joue à plein volume, sans pouvoir être baissée ni coupée. Là, chaque
   lecteur passe par un nœud de gain de l'API Web Audio, qui, lui, se règle ; vol() et setVol() cachent la différence au reste du fichier. */
const FIXED = (() => { try { const probe = new Audio(); probe.volume = 0.5; return probe.volume !== 0.5; } catch (e) { return false; } })();
let actx = null;
const gains = new WeakMap(), told = new WeakMap();
/* branche un lecteur sur son nœud de gain, une fois pour toutes */
function wire(el) {
  if (!FIXED || gains.has(el)) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!actx) actx = new AC();
    const gain = actx.createGain();
    gain.gain.value = 0;
    actx.createMediaElementSource(el).connect(gain);
    gain.connect(actx.destination);
    gains.set(el, gain);
  } catch (e) { /* pas de Web Audio : il restera « coupé ou non » (setVol) */ }
}
/* ce circuit dort tant qu'aucun geste ne l'a réveillé, et se rendort quand le téléphone passe à autre chose */
function wake() { if (actx && actx.state !== 'running') actx.resume().catch(() => { /* au prochain geste */ }); }
const vol = (el) => (FIXED ? told.get(el) ?? 0 : el.volume);
function setVol(el, value) {
  if (!FIXED) { el.volume = value; return; }
  told.set(el, value);
  const gain = gains.get(el);
  if (gain) gain.gain.value = value; else el.muted = value < 0.0005;
}

export const musicOn = () => on;
/** Le réglage du joueur, de 0 à 1 (gardé même quand la musique est coupée). */
export const musicLevel = () => level;
/** De combien le joueur a monté ou baissé la musique par rapport au réglage d'origine (1 : il n'y a pas touché) : les autres musiques du jeu suivent. */
export const musicScale = () => (on ? Math.min(3, Math.max(0.2, (level * level) / (DEFAULT * DEFAULT))) : 1);

/* ce qui se passe à l'écran décide du morceau : une partie, une draft, sinon les menus ; « hush » : une autre musique joue (le lecteur de
   l'ouverture d'un pack), celle-ci se tait */
function look() {
  if (document.querySelector('.op-song')) return 'hush';
  return document.querySelector('.mv') ? 'game' : document.querySelector('.dr') ? 'draft' : 'home';
}
const base = () => LOUD * level * level;
const wanted = () => (!on || hush ? 0 : base() * SCENES[scene].gain * (scene === 'home' && document.querySelector('.op') ? QUIET : 1));
/** Amène doucement le volume à « to », puis appelle « then » ; à zéro, la lecture se met en pause si la musique est coupée. */
function ramp(to, then) {
  clearInterval(fade);
  fade = setInterval(() => {
    const gap = to - vol(audio);
    if (Math.abs(gap) < 0.003) {
      setVol(audio, to);
      clearInterval(fade);
      if (to === 0 && !on) audio.pause();
      if (then) then();
    } else setVol(audio, Math.min(1, Math.max(0, vol(audio) + Math.sign(gap) * Math.max(0.002, Math.abs(gap) * 0.2))));
  }, 60);
}
/* met en place le morceau du moment, à l'endroit où on l'avait laissé */
function load() {
  const s = spot[scene], src = SCENES[scene].tracks[s.index % SCENES[scene].tracks.length];
  audio.src = src;
  if (s.time > 1) audio.addEventListener('loadedmetadata', () => { try { if (audio.src.endsWith(src) && s.time < audio.duration - 4) audio.currentTime = s.time; } catch (e) { /* il repartira du début */ } }, { once: true });
}
function play() {
  if (!audio.src) load();
  audio.play().then(() => { if (!switching) ramp(goal); }).catch(() => { /* le navigateur attend encore un geste : on réessaiera au prochain */ started = false; });
}
/* on change de moment : le morceau en cours s'éteint, celui du nouveau moment reprend */
function change(next) {
  if (!audio || !started || !on) { scene = next; goal = wanted(); return; }
  switching = true;
  ramp(0, () => {
    spot[scene].time = audio.currentTime || 0;
    scene = next;
    load();
    goal = wanted();
    switching = false;
    play();
  });
}
function mood() {
  const now = look();
  hush = now === 'hush';
  if (!hush && now !== scene && !switching) { change(now); crowdMood(); return; }
  const next = wanted();
  if (next !== goal) { goal = next; if (audio && on && started && !switching) ramp(goal); }
  crowdMood();
}

/* ---------- la tribune ---------- */
/* Quand la Karmine joue (l'écran de match le signale), ses supporters s'entendent très loin derrière la musique : tambours et chants d'une
   vraie tribune, en boucle. Elle se lance dès la présentation des équipes — volume à zéro — pour être prête au coup d'envoi. */
function crowdMood() {
  const want = on && !hush && !!document.querySelector('.mv[data-crowd]');
  if (want && !crowd) {
    crowd = new Audio(CROWD);
    crowd.loop = true;
    wire(crowd);
    setVol(crowd, 0);
  }
  if (!crowd) return;
  if (want && crowd.paused && !document.hidden) crowd.play().catch(() => { /* au prochain geste */ });
  if (!crowdTick && (want || vol(crowd) > 0)) {
    crowdTick = setInterval(() => {
      const live = on && !hush && !!document.querySelector('.mv[data-crowd][data-stage="game"]');
      const to = live ? Math.min(1, base() * CROWD_GAIN * (1 + swell)) : 0, gap = to - vol(crowd);
      /* la clameur retombe d'elle-même */
      swell *= 0.965;
      setVol(crowd, Math.abs(gap) < 0.002 ? to : Math.min(1, Math.max(0, vol(crowd) + gap * 0.12)));
      if (!document.querySelector('.mv[data-crowd]') && vol(crowd) === 0) { crowd.pause(); clearInterval(crowdTick); crowdTick = 0; swell = 0; }
    }, 80);
  }
}
/** La tribune s'anime : une action de la Karmine (power : 1 pour une élimination, davantage pour un objectif ou un coup d'éclat). */
export function cheer(power = 1) { swell = Math.min(2.2, swell + 0.7 * power); }

/** À appeler à chaque geste du joueur : lance la musique si elle n'est pas coupée (un navigateur ne laisse rien jouer avant le premier geste),
    et relance ce qu'il aurait empêché de démarrer. */
export function startMusic() {
  wake();
  if (started) {
    if (on && audio && audio.paused && !document.hidden && !switching) play();
    if (crowd && crowd.paused && on && document.querySelector('.mv[data-crowd]')) crowd.play().catch(() => { /* tant pis */ });
    return;
  }
  if (!on) return;
  started = true;
  if (!audio) {
    audio = new Audio();
    audio.preload = 'none';
    wire(audio);
    wake();
    setVol(audio, 0);
    spot.home.index = Math.floor(Math.random() * SCENES.home.tracks.length);
    /* un morceau fini : le suivant du même moment (ou le même, s'il est seul) */
    audio.addEventListener('ended', () => { const s = spot[scene]; s.index = (s.index + 1) % SCENES[scene].tracks.length; s.time = 0; load(); play(); });
    /* la musique ne continue pas dans un onglet qu'on ne regarde plus */
    document.addEventListener('visibilitychange', () => {
      if (crowd) { if (document.hidden) crowd.pause(); else crowdMood(); }
      if (!on || !started) return;
      if (document.hidden) audio.pause(); else play();
    });
  }
  if (!watch) watch = setInterval(mood, 500);
  const now = look();
  hush = now === 'hush';
  if (!hush) scene = now;
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
  if (switching) return;
  clearInterval(fade);
  setVol(audio, goal);
  if (audio.paused) play();
}
