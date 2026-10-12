/* Les sons du jeu, fabriqués par le navigateur (aucun fichier à charger) : souffles, impacts, petites notes de cloche.
   Le son se coupe d'un bouton ; le choix est gardé dans ce navigateur. */
import { STORE } from './config.js';

/* le curseur du joueur va de 0 à 1 (volume.js) ; le volume réel suit son carré, l'oreille entendant en proportion (0,7 : le réglage d'origine) */
const DEFAULT = 0.7;
let ctx = null, out = null, noiseBuf = null, on = true, level = DEFAULT;
try {
  on = localStorage.getItem(STORE + 'son') !== '0';
  const saved = localStorage.getItem(STORE + 'volume-sons');
  if (saved !== null && Number(saved) >= 0 && Number(saved) <= 100) level = Number(saved) / 100;
} catch (e) { on = true; }
if (level <= 0) on = false;
const loud = () => (on ? level * level : 0);
function save() {
  try { localStorage.setItem(STORE + 'son', on ? '1' : '0'); localStorage.setItem(STORE + 'volume-sons', String(Math.round(level * 100))); } catch (e) { /* réglage non gardé */ }
}

export const soundOn = () => on;
/** Le réglage du joueur, de 0 à 1 (gardé même quand le son est coupé). */
export const soundLevel = () => level;
export function setSound(value) {
  on = !!value;
  if (on && level <= 0) level = DEFAULT;
  save();
  if (out) out.gain.value = loud();
}
/** Règle le volume des effets, de 0 à 1 : à zéro ils sont coupés. */
export function setSoundLevel(value) {
  level = Math.min(1, Math.max(0, Number(value) || 0));
  on = level > 0;
  save();
  if (out) out.gain.value = loud();
}

/* Le navigateur n'autorise le son qu'après un geste du joueur : tout est créé au premier son demandé. */
function audio() {
  if (!on) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    out = ctx.createGain();
    out.gain.value = loud();
    out.connect(ctx.destination);
    /* un écho court et discret, pour donner de l'air aux notes (très peu de retour : des sons qui s'enchaînent ne s'empilent pas) */
    const delay = ctx.createDelay(0.5), back = ctx.createGain(), wet = ctx.createGain();
    delay.delayTime.value = 0.13; back.gain.value = 0.2; wet.gain.value = 0.14;
    out.connect(delay); delay.connect(back); back.connect(delay); delay.connect(wet); wet.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Une note. to : fréquence d'arrivée (glissé) ; swell : la note enfle au lieu de s'éteindre. */
function tone(freq, o = {}) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + (o.t || 0), dur = o.dur || 0.4, vol = o.vol || 0.15;
  const osc = c.createOscillator(), gain = c.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  if (o.swell) {
    gain.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.92);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.06);
  } else {
    gain.gain.exponentialRampToValueAtTime(vol, t0 + (o.attack || 0.006));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  osc.connect(gain); gain.connect(out);
  osc.start(t0); osc.stop(t0 + dur + 0.1);
}

/** Un souffle : du bruit filtré. to : fréquence d'arrivée du filtre. */
function noise(o = {}) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + (o.t || 0), dur = o.dur || 0.2, vol = o.vol || 0.15;
  const src = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
  src.buffer = noiseBuf; src.loop = true;
  filter.type = o.type || 'bandpass';
  filter.Q.value = o.q || 0.9;
  filter.frequency.setValueAtTime(o.freq || 2000, t0);
  if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  if (o.swell) {
    gain.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.92);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.06);
  } else {
    gain.gain.exponentialRampToValueAtTime(vol, t0 + (o.attack || 0.01));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  src.connect(filter); filter.connect(gain); gain.connect(out);
  src.start(t0); src.stop(t0 + dur + 0.1);
}

/** Une note de cloche : la note et deux harmoniques plus brèves. */
function bell(freq, t = 0, vol = 0.14, dur = 0.9) {
  tone(freq, { t, dur, vol });
  tone(freq * 2.01, { t, dur: dur * 0.55, vol: vol * 0.32 });
  tone(freq * 3.02, { t, dur: dur * 0.3, vol: vol * 0.13 });
}

/* gamme pentatonique de mi majeur : toutes les notes sonnent bien ensemble */
const E5 = 659.25, G5 = 830.61, B5 = 987.77, C6 = 1108.73, E6 = 1318.51, G6 = 1661.22, B6 = 1975.53, E7 = 2637.02;

export const sfx = {
  /** Un indice apparaît avant une grosse carte. */
  clue(i = 0) {
    bell([E5, G5, B5][i % 3], 0, 0.1, 0.5);
    noise({ dur: 0.1, vol: 0.04, type: 'highpass', freq: 4200 });
  },
  /** Roulement qui monte avant le retournement d'une grosse carte. */
  rise(dur = 0.8) {
    noise({ dur, vol: 0.12, freq: 700, to: 6400, q: 1.2, swell: true });
    tone(130, { dur, to: 520, vol: 0.1, type: 'triangle', swell: true });
  },
  /** La carte se retourne : d'un simple souffle pour une Recrue à une volée de cloches pour un MVP. */
  flip(tier = 1) {
    noise({ dur: 0.1, vol: 0.08, type: 'highpass', freq: 3200 });
    if (tier <= 1) { tone(392, { t: 0.02, dur: 0.2, vol: 0.07, type: 'triangle' }); return; }
    if (tier === 2) { bell(E5, 0.02, 0.1, 0.5); bell(B5, 0.1, 0.07, 0.55); return; }
    const notes = tier === 3 ? [E5, G5, B5, E6] : tier === 4 ? [E5, G5, B5, E6, G6] : [E5, G5, B5, C6, E6, G6, B6, E7];
    const step = tier === 5 ? 0.075 : 0.07;
    notes.forEach((f, k) => bell(f, 0.02 + k * step, 0.12, 0.9 + tier * 0.12));
    if (tier >= 4) {
      const t = 0.02 + notes.length * step;
      [E5, B5, E6].forEach((f) => tone(f, { t, dur: 1.9, vol: 0.06, attack: 0.05 }));
      noise({ t: 0.05, dur: 1.4, vol: 0.035, type: 'highpass', freq: 6200 });
      tone(120, { dur: 0.5, to: 45, vol: 0.4 });
    }
    if (tier === 5) {
      tone(82.4, { t: 0.02, dur: 1.6, vol: 0.2, attack: 0.02 });
      [G5, C6, G6].forEach((f) => tone(f, { t: 0.75, dur: 2.2, vol: 0.05, attack: 0.08 }));
    }
  },
  /** Un gros tirage s'annonce : un scintillement qui monte (plus long pour une carte très rare). */
  shimmer(tier = 4) {
    (tier >= 5 ? [E6, G6, B6, E7, G6, B6, E7] : [E6, G6, B6, E7]).forEach((f, k) => bell(f, k * 0.07, 0.04, 0.8));
    noise({ dur: tier >= 5 ? 1.1 : 0.7, vol: 0.03, type: 'highpass', freq: 7000 });
    tone(196, { dur: tier >= 5 ? 1.1 : 0.7, to: 392, vol: 0.05, type: 'triangle', swell: true });
  },
  /** Un battement de cœur, avant une carte très rare : deux coups sourds. */
  heart() { tone(64, { dur: 0.17, to: 44, vol: 0.34 }); tone(56, { t: 0.18, dur: 0.22, to: 38, vol: 0.24 }); },
  /** La carte glisse (mise en valeur, retour à sa place). */
  whoosh() { noise({ dur: 0.32, vol: 0.1, freq: 500, to: 2600, q: 0.7 }); },
  /** Toutes les cartes sont retournées. */
  done() { bell(E5, 0, 0.08, 0.9); bell(B5, 0.09, 0.07, 0.9); bell(E6, 0.18, 0.07, 1.2); },
  /** Un bouton, un champion désigné : un petit « toc » de bois, grave et bref (pas un bip). */
  click() { tone(420, { dur: 0.045, to: 300, vol: 0.03, type: 'triangle' }); noise({ dur: 0.018, vol: 0.012, type: 'highpass', freq: 2600 }); },
  /** Un choix qui se fait tout seul (draft automatique) : presque rien, pour ne pas lasser quand ils s'enchaînent. */
  tick() { tone(300, { dur: 0.06, to: 210, vol: 0.022, type: 'triangle' }); },

  /* ---------- le sachet ---------- */
  /** Le papier crisse quand on saisit le sachet. */
  crinkle() {
    for (let i = 0; i < 4; i++) noise({ t: i * 0.04 + Math.random() * 0.02, dur: 0.035, vol: 0.03 + Math.random() * 0.03, type: 'highpass', freq: 3200 + Math.random() * 2600 });
  },
  /** Un grain de déchirure, joué au fil du doigt : plus fort quand le geste est vif (speed de 0 à 1). */
  tearGrain(speed = 0.5) {
    noise({ dur: 0.03 + Math.random() * 0.02, vol: 0.05 + speed * 0.11, freq: 2200 + Math.random() * 4200, q: 1.1 });
    noise({ dur: 0.045, vol: 0.025 + speed * 0.05, type: 'lowpass', freq: 900 });
  },
  /** Le sachet se déchire d'un trait (un simple toucher). from : part déjà déchirée. */
  tear(dur = 0.42, from = 0) {
    const n = Math.max(4, Math.round(24 * (1 - from)));
    for (let i = 0; i < n; i++) noise({ t: (i / n) * dur * (0.9 + Math.random() * 0.2), dur: 0.03 + Math.random() * 0.025, vol: 0.06 + Math.random() * 0.08, freq: 2400 + Math.random() * 4000 + i * 60, q: 1.1 });
    noise({ dur, vol: 0.045, type: 'lowpass', freq: 1100, to: 700 });
  },
  /** La bande se détache. */
  snap() { noise({ dur: 0.07, vol: 0.18, type: 'highpass', freq: 2600 }); tone(190, { dur: 0.12, to: 90, vol: 0.1 }); },
  /** Les cartes glissent hors du sachet. */
  slideOut() { noise({ dur: 0.55, vol: 0.07, freq: 700, to: 2600, q: 0.6, attack: 0.1 }); },
  /** Une carte part se ranger. */
  slide() { noise({ dur: 0.2, vol: 0.05, freq: 1300, to: 3000, q: 0.7 }); },

  /* ---------- le combat ---------- */
  /** C'est au joueur de choisir : deux notes douces, une octave plus bas qu'avant. */
  turn() { bell(B5 / 2, 0, 0.032, 0.4); bell(E6 / 2, 0.1, 0.028, 0.5); },
  /** Un champion est banni : un coup feutré. */
  ban() { tone(140, { dur: 0.2, to: 72, vol: 0.12 }); noise({ dur: 0.1, vol: 0.04, type: 'lowpass', freq: 1000, to: 240 }); },
  /** Un champion est verrouillé : le coup, puis une note brève. */
  pick() { tone(112, { dur: 0.26, to: 68, vol: 0.13 }); bell(E5, 0.01, 0.055, 0.5); bell(B5, 0.07, 0.028, 0.45); },
  /** Présentation des deux équipes. */
  versus() {
    tone(65.4, { dur: 1.4, vol: 0.28, attack: 0.03 });
    tone(98, { t: 0.02, dur: 1.3, vol: 0.12, attack: 0.05 });
    noise({ dur: 0.9, vol: 0.07, freq: 400, to: 3000, swell: true });
    bell(E5, 0.9, 0.1, 1.3); bell(B5, 0.98, 0.06, 1.2);
  },
  /** Une élimination. */
  kill() { noise({ dur: 0.09, vol: 0.15, freq: 2600, to: 900, q: 1.2 }); tone(240, { dur: 0.16, to: 90, vol: 0.2 }); },
  /** Une tour s'effondre. */
  tower() { noise({ dur: 0.5, vol: 0.2, type: 'lowpass', freq: 900, to: 90 }); tone(90, { dur: 0.5, to: 40, vol: 0.3 }); },
  /** Un objectif est pris ; big : Baron ou dragon ancestral. */
  objective(big) {
    [E5 / 2, B5 / 2].forEach((f, k) => tone(f, { t: k * 0.12, dur: 0.7, vol: 0.12, type: 'triangle', attack: 0.03 }));
    if (big) { tone(82.4, { dur: 1.2, vol: 0.22, attack: 0.03 }); bell(E6, 0.26, 0.08, 1.1); }
  },
  /** Un ultime part, pendant un ralenti : un souffle qui s'ouvre, une note grave. */
  ult() { noise({ dur: 0.3, vol: 0.05, freq: 500, to: 3000, q: 0.8 }); bell(E5 / 2, 0.02, 0.06, 0.6); },
  /** Début d'un ralenti : tout descend. */
  slowmo() { tone(520, { dur: 0.7, to: 130, vol: 0.11, type: 'triangle' }); noise({ dur: 0.7, vol: 0.09, freq: 4200, to: 500, q: 0.8 }); },
  /** Le Nexus explose. */
  nexus() { tone(140, { dur: 1.1, to: 30, vol: 0.5 }); noise({ dur: 1.2, vol: 0.3, type: 'lowpass', freq: 3000, to: 120 }); noise({ dur: 1.6, vol: 0.05, type: 'highpass', freq: 5000 }); },
  victory() {
    [E5, G5, B5, E6, G6, B6].forEach((f, k) => bell(f, k * 0.11, 0.12, 1.4));
    [E5, B5, E6].forEach((f) => tone(f, { t: 0.7, dur: 2.2, vol: 0.06, attack: 0.06 }));
    tone(82.4, { t: 0.02, dur: 1.8, vol: 0.2, attack: 0.02 });
  },
  /** Trois notes qui descendent, en mineur. */
  defeat() {
    [493.88, 392, 329.63].forEach((f, k) => tone(f, { t: k * 0.28, dur: 1, vol: 0.1, type: 'triangle', attack: 0.03 }));
    tone(61.7, { t: 0.55, dur: 1.9, vol: 0.2, attack: 0.05 });
  },
};
