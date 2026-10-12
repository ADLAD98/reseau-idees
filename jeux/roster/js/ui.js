/* Petits outils d'affichage partagés par les écrans du jeu : fenêtres, dates, nombres. */
import { esc } from './cards.js';

export const icon = (id) => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + id + '"/></svg>';
export const plural = (n, one, many) => n + ' ' + (n > 1 ? many : one);
/** Un nombre avec des espaces entre les milliers : 12 500. */
export const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
/** « à l'instant », « il y a 5 min », « il y a 3 h », « il y a 2 j ». */
export function since(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  return m < 1 ? 'à l\'instant' : m < 60 ? 'il y a ' + m + ' min' : m < 1440 ? 'il y a ' + Math.floor(m / 60) + ' h' : 'il y a ' + Math.floor(m / 1440) + ' j';
}
/** Compte à rebours court : 2:05. */
export function countdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** L'en-tête d'une fenêtre : titre, sous-titre, bouton de fermeture. */
export const sheetTitle = (title, sub) => '<div class="sheet-title"><div><h2>' + title + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>'
  + '<span class="spacer"></span><button class="close" type="button" aria-label="Fermer">' + icon('i-close') + '</button></div>';

/** Ouvre une fenêtre par-dessus l'écran. Elle se referme par son bouton, la touche Échap ou un clic en dehors.
    opts : cls (classes de la boîte), label (nom lu par les lecteurs d'écran), onClose, keep (ne se ferme pas d'un clic en dehors).
    Renvoie { el, box, close }. */
export function openSheet(inner, opts = {}) {
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = '<div class="sheet-box panel col ' + (opts.cls || '') + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.label || '') + '">' + inner + '</div>';
  const before = document.body.style.overflow;
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    sheet.remove();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = before;
    if (opts.onClose) opts.onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape' && !opts.keep) close(); };
  sheet.addEventListener('click', (e) => { if ((e.target === sheet && !opts.keep) || e.target.closest('.close')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(sheet);
  return { el: sheet, box: sheet.firstChild, close, get open() { return open; } };
}

/** Demande une confirmation. Renvoie une promesse : true si le joueur confirme. */
export function confirmSheet(title, text, yes, opts = {}) {
  return new Promise((resolve) => {
    let answer = false;
    const s = openSheet(sheetTitle(esc(title)) + '<p class="lead">' + text + '</p><div class="actions"><button class="btn ' + (opts.danger ? 'danger' : 'primary') + '" type="button" data-yes>' + esc(yes) + '</button>'
      + '<button class="btn" type="button" data-no>' + esc(opts.no || 'Annuler') + '</button></div>', { cls: 'small', label: title, onClose: () => resolve(answer) });
    s.box.querySelector('[data-yes]').addEventListener('click', () => { answer = true; s.close(); });
    s.box.querySelector('[data-no]').addEventListener('click', () => s.close());
  });
}
