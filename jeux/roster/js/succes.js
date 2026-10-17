/* Les succès du joueur (serveur : succes.ts) : une section du Profil, famille par famille, avec l'avancement de chacun ; et un mot
   quand un succès vient d'être débloqué (vérifié de temps en temps, au fil des pages). Face à un serveur qui ne les connaît pas
   encore, rien ne s'affiche. */
import { esc } from './cards.js';
import { STORE } from './config.js';

let G = null, lastCheck = 0;
const SEEN = STORE + 'succes';

export const achievementsSectionHTML = () => '<section class="panel ach" id="ach" hidden></section>';

const tile = (a) => '<div class="ach-tile' + (a.done ? ' done' : '') + '"><i class="ach-mark" aria-hidden="true"></i><div class="ach-txt"><b>' + esc(a.name) + '</b><small>' + esc(a.desc) + '</small>'
  + (a.done ? '' : '<span class="ach-bar"><i style="width:' + Math.round((100 * a.value) / a.target) + '%"></i></span><small class="ach-num">' + a.value + ' / ' + a.target + '</small>') + '</div></div>';

function draw(d) {
  const el = document.getElementById('ach');
  if (!el) return;
  const cats = [...new Set(d.list.map((a) => a.cat))];
  el.hidden = false;
  el.innerHTML = '<div class="ach-head"><h3>Succès</h3><span class="ach-count"><b>' + d.done + '</b> / ' + d.total + '</span></div>'
    + cats.map((c) => '<h4 class="ach-cat">' + esc(c) + '</h4><div class="ach-grid">' + d.list.filter((a) => a.cat === c).map(tile).join('') + '</div>').join('');
}
/* les succès débloqués depuis la dernière fois, sur cet appareil : un mot (la toute première fois, rien : pas d'avalanche) */
function announce(d) {
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(SEEN) || 'null'); } catch (e) { seen = null; }
  try { localStorage.setItem(SEEN, JSON.stringify(d.list.filter((a) => a.done).map((a) => a.id))); } catch (e) { /* tant pis */ }
  if (!Array.isArray(seen)) return;
  const fresh = d.list.filter((a) => a.done && !seen.includes(a.id));
  if (fresh.length) G.toast(fresh.length > 1 ? fresh.length + ' succès débloqués : ' + fresh.map((a) => a.name).join(', ') : 'Succès débloqué : ' + fresh[0].name);
}

/** La section du Profil. */
export async function loadAchievements(ctx) {
  G = ctx;
  let d = null;
  try { d = await G.call('GET', '/api/achievements'); } catch (e) { return; }
  lastCheck = Date.now();
  draw(d);
  announce(d);
}
/** Au fil des pages : un succès débloqué depuis la dernière vérification (au plus une toutes les trois minutes). */
export async function checkAchievements(ctx) {
  if (Date.now() - lastCheck < 180000) return;
  G = ctx;
  lastCheck = Date.now();
  try { announce(await G.call('GET', '/api/achievements')); } catch (e) { /* serveur sans succès, ou injoignable */ }
}
