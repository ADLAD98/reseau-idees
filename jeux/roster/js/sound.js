/* Les sons du jeu, fabriqués par le navigateur (aucun fichier à charger) : souffles, impacts, petites notes de cloche.
   Le son se coupe d'un bouton ; le choix est gardé dans ce navigateur. */
import { STORE } from './config.js';

let ctx = null, out = null, noiseBuf = null, on = true;
try { on = localStorage.getItem(STORE + 'son') !== '0'; } catch (e) { on = true; }

export const soundOn = () => on;
export function setSound(value) {
  on = !!value;
  try { localStorage.setItem(STORE + 'son', on ? '1' : '0'); } catch (e) { /* réglage non gardé */ }
  if (out) out.gain.value = on ? 0.5 : 0;
}

/* Le navigateur n'autorise le son qu'après un geste du joueur : tout est créé au premier son demandé. */
function audio() {
  if (!on) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(ctx.destination);
    /* un écho court et discret, pour donner de l'air aux notes */
    const delay = ctx.createDelay(0.5), back = ctx.createGain(), wet = ctx.createGain();
    delay.delayTime.value = 0.13; back.gain.value = 0.3; wet.gain.value = 0.2;
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
  /** Le sachet se charge : un souffle et une note qui montent. */
  charge(dur = 1.2) {
    tone(98, { dur, to: 392, vol: 0.13, type: 'triangle', swell: true });
    tone(196, { dur, to: 784, vol: 0.05, swell: true });
    noise({ dur, vol: 0.09, freq: 500, to: 5200, q: 1.4, swell: true });
  },
  /** Le sachet éclate. */
  burst() {
    tone(170, { dur: 0.55, to: 36, vol: 0.55 });
    noise({ dur: 0.4, vol: 0.32, type: 'lowpass', freq: 2400, to: 160 });
    noise({ dur: 0.9, vol: 0.05, type: 'highpass', freq: 5200 });
    bell(E6, 0.03, 0.1, 1.3); bell(B6, 0.1, 0.07, 1.1);
  },
  /** Une carte qui vole vers sa place. */
  deal(i = 0) {
    noise({ dur: 0.16, vol: 0.09, freq: 1500 + i * 260, to: 3800 + i * 300, q: 0.8 });
    tone(360 + i * 36, { t: 0.13, dur: 0.06, vol: 0.05, type: 'triangle' });
  },
  /** Le joueur touche une carte : une petite montée avant le retournement. */
  arm(tier = 1) {
    tone(260 + tier * 40, { dur: 0.26, to: 520 + tier * 90, vol: 0.05 + tier * 0.008, type: 'triangle' });
  },
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
  /** La carte glisse (mise en valeur, retour à sa place). */
  whoosh() { noise({ dur: 0.32, vol: 0.1, freq: 500, to: 2600, q: 0.7 }); },
  /** Toutes les cartes sont retournées. */
  done() { bell(E5, 0, 0.08, 0.9); bell(B5, 0.09, 0.07, 0.9); bell(E6, 0.18, 0.07, 1.2); },
  click() { tone(880, { dur: 0.05, vol: 0.05 }); },
};
