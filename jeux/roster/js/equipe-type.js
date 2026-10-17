/* L'équipe type de la semaine (serveur : equipe-type.ts), dans Packs › Vrais matchs : à chaque poste, le pro le plus en forme des vrais
   matchs de la semaine, ses chiffres ; et le défi de la semaine : aligner l'un d'eux dans son équipe, puis gagner un match. Sans forme
   calculée, ou face à un serveur qui ne la connaît pas : rien. */
import { cardHTML, esc } from './cards.js';

let G = null, T = null;
const ROLE = { TOP: 'Top', JGL: 'Jungle', MID: 'Mid', BOT: 'ADC', SUP: 'Support' };

export const teamWeekSectionHTML = () => '<section class="tw" id="teamWeek" hidden></section>';

export async function loadTeamWeek(ctx) {
  G = ctx;
  try { T = await G.call('GET', '/api/equipe-type'); } catch (e) { return; }
  draw();
}

function draw() {
  const el = document.getElementById('teamWeek');
  if (!el) return;
  if (!T || !T.team || !T.team.length) { el.hidden = true; return; }
  el.hidden = false;
  const cat = G.S.cat, owned = new Set([...G.S.owned.keys()].map((k) => k.split('~')[0]));
  const cards = T.team.map((t) => {
    const c = cat.cardById.get(t.id);
    if (!c) return '';
    const own = owned.has(t.id);
    return '<div class="tw-card' + (own ? ' own' : '') + '"><span class="tw-role">' + (ROLE[t.role] || esc(t.role)) + '</span>' + cardHTML(c, cat)
      + '<p class="tw-stats"><b>KDA ' + String(t.kda).replace('.', ',') + '</b> · ' + t.kp + ' % KP · ' + t.gpm + ' or/min</p>'
      + '<span class="tw-tag">' + (own ? 'Dans ta collection' : '<i>Pas encore à toi</i>') + '</span></div>';
  }).join('');
  const ready = T.inDeck && T.won;
  const step = (on, n, label) => '<span class="tw-step' + (on ? ' on' : '') + '"><i>' + (on ? '✓' : n) + '</i>' + label + '</span>';
  el.innerHTML = '<h2 class="h2">Équipe type de la semaine</h2>'
    + '<p class="ms-sub">Les pros les plus en forme des vrais matchs de la semaine, poste par poste. Leur note est relevée jusqu\'au prochain lundi.</p>'
    + '<div class="tw-grid">' + cards + '</div>'
    + '<div class="ms tw-goal' + (T.claimed ? ' claimed' : ready ? ' done' : '') + '"><div class="ms-t"><b>Aligne l\'un d\'eux dans ton équipe, puis gagne un match cette semaine</b>'
    + '<span class="tw-steps">' + step(T.inDeck, 1, 'aligné') + step(T.won, 2, 'un match gagné') + '</span></div>'
    + (T.claimed ? '<span class="ms-ok">+' + T.reward + ' touchés</span>'
      : '<button class="btn' + (ready ? ' primary' : '') + '" type="button" id="twClaim"' + (ready ? '' : ' disabled') + '>+' + T.reward + ' crédits</button>') + '</div>';
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('#twClaim');
  if (!b || b.disabled || !G) return;
  b.disabled = true;
  const res = await G.guard(() => G.call('POST', '/api/equipe-type/claim', {}));
  if (!res) { b.disabled = false; return; }
  G.applyState(res);
  T = res;
  G.sfx.click();
  G.toast('+' + res.reward + ' crédits : défi de l\'équipe type réussi');
  draw();
});
