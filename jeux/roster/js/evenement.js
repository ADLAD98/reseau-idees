/* L'événement du moment, sur l'écran Packs (serveur : evenement.ts) : le Mondial 2026, le temps des vrais Worlds. Cinq objectifs payés en
   crédits ; les cinq accomplis, un bonus et le titre de profil « Mondial 2026 ». En dehors de ses dates, ou face à un serveur qui ne le
   connaît pas : rien. Les titres gagnés s'affichent sur le profil (badgesHTML). */
import { esc } from './cards.js';

let G = null, E = null;
const DAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });

export const eventSectionHTML = () => '<section class="missions event" id="event" hidden></section>';

/** Les titres de profil d'un joueur (serveur récent : player.badges). */
export const badgesHTML = (list) => (list || []).map((b) => '<span class="badge-title" title="Titre gagné à l\'événement ' + esc(b.name) + '"><i aria-hidden="true"></i>' + esc(b.name) + '</span>').join('');

export async function loadEvent(ctx) {
  G = ctx;
  let res = null;
  try { res = await G.call('GET', '/api/evenement'); } catch (e) { return; }
  E = res && res.event;
  draw();
}

function draw() {
  const box = document.getElementById('event');
  if (!box) return;
  if (!E) { box.hidden = true; return; }
  box.hidden = false;
  const left = Math.max(0, E.end - Date.now()), days = Math.ceil(left / 86400000);
  const row = (g) => '<div class="ms' + (g.claimed ? ' claimed' : g.done ? ' done' : '') + '"><div class="ms-t"><b>' + esc(g.label) + '</b>'
    + '<span class="bar"><i style="width:' + Math.round((100 * g.progress) / g.goal) + '%"></i></span></div><em class="num">' + g.progress + ' / ' + g.goal + '</em>'
    + (g.claimed ? '<span class="ms-ok">+' + g.reward + ' touchés</span>' : '<button class="btn' + (g.done ? ' primary' : '') + '" type="button" data-eclaim="' + esc(g.id) + '"' + (g.done ? '' : ' disabled') + '>+' + g.reward + ' crédits</button>') + '</div>';
  const n = E.goals.filter((g) => g.done).length, b = E.bonus;
  box.innerHTML = '<div class="ev-head"><div class="ev-mark"><span>Événement</span><b>' + esc(E.name) + '</b></div>'
    + '<p class="ev-lead">Le temps des vrais Worlds : cinq objectifs, des crédits, et le titre <b>« ' + esc(b.badge) + ' »</b> sur ton profil pour qui les réussit tous. '
    + 'Les gros matchs des Worlds (quarts, demies, finale) paient double aux pronostics.</p>'
    + '<p class="ev-when">Finale le ' + esc(DAY.format(E.final)) + ' · fin de l\'événement dans ' + days + ' jour' + (days > 1 ? 's' : '') + '</p></div>'
    + '<div class="ms-list">' + E.goals.map(row).join('')
    + '<div class="ms bonus' + (b.claimed ? ' claimed' : b.done ? ' done' : '') + '"><div class="ms-t"><b>Les cinq objectifs · titre « ' + esc(b.badge) + ' »</b><span class="bar"><i style="width:' + Math.round((100 * n) / E.goals.length) + '%"></i></span></div>'
    + '<em class="num">' + n + ' / ' + E.goals.length + '</em>'
    + (b.claimed ? '<span class="ms-ok">Titre gagné</span>' : '<button class="btn' + (b.done ? ' primary' : '') + '" type="button" data-eclaim="tous"' + (b.done ? '' : ' disabled') + '>+' + b.reward + ' et le titre</button>') + '</div></div>';
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('#event [data-eclaim]');
  if (!btn || btn.disabled || !G) return;
  btn.disabled = true;
  const res = await G.guard(() => G.call('POST', '/api/evenement/claim', { goal: btn.dataset.eclaim }));
  if (!res) { btn.disabled = false; return; }
  G.applyState(res);
  E = res.event;
  if (res.badge) { G.sfx.done(); G.toast('Titre « ' + res.badge + ' » gagné : il s\'affiche sur ton profil. +' + res.reward + ' crédits'); }
  else { G.sfx.click(); G.toast('+' + res.reward + ' crédits'); }
  draw();
});

/** Une récompense de l'événement attend d'être touchée (la pastille de l'onglet « Défis »). */
export const eventWaiting = () => !!E && (E.goals.some((g) => g.done && !g.claimed) || (E.bonus.done && !E.bonus.claimed));
