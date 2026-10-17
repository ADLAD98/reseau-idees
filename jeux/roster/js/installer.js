/* « Installer l'appli » : Roster s'ajoute à l'écran d'accueil du téléphone (ou au bureau de l'ordinateur) et s'ouvre ensuite comme une
   application, en plein écran (le rappel « pack prêt » y marche mieux, et sur iPhone il n'existe que là). Quand le navigateur le
   propose (Chrome, Edge, Samsung…), un bouton le fait d'un toucher ; sur iPhone et iPad, Safari ne le permet pas à un site : on dit
   comment faire (Partager, puis « Sur l'écran d'accueil »). Déjà installé (ouvert en appli) : rien. Le réglage est dans
   Profil › Réglages ; sur téléphone, une bannière le propose aussi une fois, sous le pack. */
import { STORE } from './config.js';

let prompt = null, G = null;
const HIDE = STORE + 'installer-vu';
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const PHONE = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
/** Le jeu tourne déjà en appli installée. */
export const installed = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };

addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); prompt = e; draw(); });
addEventListener('appinstalled', () => { prompt = null; draw(); if (G) G.toast('Roster est installé : tu le retrouves sur ton écran d\'accueil.'); });

/** Ce que l'appareil permet : 'prompt' (un bouton suffit), 'ios' (marche à suivre), '' (rien à proposer). */
export const installMode = () => (installed() ? '' : prompt ? 'prompt' : IOS ? 'ios' : '');

/** La ligne du Profil › Réglages. */
export const installRowHTML = () => '<div class="switch setting" id="installRow" hidden><span>Installer l\'appli<small id="installHint">Roster sur ton écran d\'accueil, en plein écran, comme une application</small></span>'
  + '<button class="btn" type="button" data-install>Installer</button></div>';
/** La bannière du téléphone, sous le pack (une seule fois, tant qu'on ne l'a pas fermée). */
export const installBannerHTML = () => '<div class="inst-banner" id="installBanner" hidden><span><b>Installe Roster</b> sur ton écran d\'accueil : il s\'ouvrira comme une appli.</span>'
  + '<button class="btn primary" type="button" data-install>Installer</button><button class="inst-x" type="button" data-install-hide aria-label="Plus tard">×</button></div>';

export function startInstall(ctx) { G = ctx; draw(); }

/** Montre ce qui peut l'être, là où c'est affiché. */
export function draw() {
  const mode = installMode();
  const row = document.getElementById('installRow');
  if (row) {
    row.hidden = !mode;
    const hint = document.getElementById('installHint'), btn = row.querySelector('[data-install]');
    if (mode === 'ios') { hint.textContent = 'sur iPhone : touche « Partager » (le carré à flèche, en bas de Safari), puis « Sur l\'écran d\'accueil »'; btn.hidden = true; }
  }
  const banner = document.getElementById('installBanner');
  if (banner) {
    let seen = false;
    try { seen = localStorage.getItem(HIDE) === '1'; } catch (e) { seen = false; }
    banner.hidden = !(PHONE && mode && !seen);
    if (mode === 'ios') { banner.querySelector('span').innerHTML = '<b>Installe Roster</b> : touche « Partager » en bas de Safari, puis « Sur l\'écran d\'accueil ».'; banner.querySelector('[data-install]').hidden = true; }
  }
}

document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-install-hide]')) {
    try { localStorage.setItem(HIDE, '1'); } catch (err) { /* elle reviendra */ }
    const b = document.getElementById('installBanner');
    if (b) b.hidden = true;
    return;
  }
  if (!e.target.closest('[data-install]') || !prompt) return;
  const p = prompt;
  prompt = null;
  try { await p.prompt(); await p.userChoice; } catch (err) { /* refusé ou impossible */ }
  try { localStorage.setItem(HIDE, '1'); } catch (err) { /* tant pis */ }
  draw();
});
