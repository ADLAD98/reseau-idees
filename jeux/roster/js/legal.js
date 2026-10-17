/* La page des mentions légales : l'adresse du site est celle de la barre d'adresse (elle suit d'elle-même un changement de nom de domaine),
   les hébergeurs viennent de config.js (HOSTS). */
import { HOSTS } from './config.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const home = new URL('./', location.href).href;
for (const a of document.querySelectorAll('[data-site]')) { a.href = home; a.textContent = home.replace(/\/$/, ''); }
document.getElementById('hosts').innerHTML = HOSTS.map((h) => '<li><b>' + esc(h.role) + '</b> : ' + esc(h.name) + ', ' + esc(h.address)
  + ' — <a href="' + esc(h.site) + '" target="_blank" rel="noopener">' + esc(h.site.replace(/^https:\/\//, '')) + '</a>' + (h.note ? ' (' + esc(h.note) + ')' : '') + '.</li>').join('');
