/* Les saisons du classé (serveur : saisons.ts) : une par mois. Dans Jouer › En ligne, la saison en cours — sa fin, mon rang, la
   récompense qu'il me vaudrait, et le barème ; dans Profil › Succès, mes saisons passées. Face à un serveur qui ne les connaît pas : rien. */
import { esc } from './cards.js';
import { num, plural } from './ui.js';

let G = null, D = null;
export const seasonSectionHTML = () => '<section class="season" id="season" hidden></section>';
export const pastSeasonsSectionHTML = () => '<section class="season-past" id="seasonPast" hidden></section>';

export async function loadSeason(ctx) {
  G = ctx;
  try { D = await G.call('GET', '/api/saison'); } catch (e) { return; }
  draw();
}

function left(ms) {
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000);
  return d ? plural(d, 'jour', 'jours') + (d < 3 ? ' ' + h + ' h' : '') : h + ' h';
}

function draw() {
  const box = document.getElementById('season');
  if (box && D) {
    const m = D.mine, need = Math.max(0, D.minGames - m.games);
    box.hidden = false;
    box.innerHTML = '<div class="ss-head panel"><div><span class="label">Saison de ' + esc(D.name) + '</span><b>Fin dans ' + left(D.endsAt - Date.now()) + '</b>'
      + '<p>À la fin du mois, chaque joueur qui a disputé au moins ' + D.minGames + ' parties classées reçoit des crédits selon son rang. Puis la saison suivante commence : tes points de ligue sont divisés par deux.</p></div>'
      + '<div class="ss-mine"><span>Ton rang</span><b>' + esc(m.rank) + '</b><em>' + (m.eligible ? 'Récompense prévue : <strong>' + num(m.reward) + ' crédits</strong>'
        : 'Encore ' + plural(need, 'partie classée', 'parties classées') + ' pour la récompense') + '</em><small>' + plural(m.games, 'partie', 'parties') + ' cette saison</small></div></div>'
      + '<details class="more ss-table"><summary>Les récompenses, rang par rang</summary><ul>'
      + D.rewards.map((r) => '<li' + (r.tier === m.tier ? ' class="me"' : '') + '><span>' + esc(r.name) + '</span><b>' + num(r.reward) + ' crédits</b></li>').join('') + '</ul></details>';
  }
  const past = document.getElementById('seasonPast');
  if (past && D) {
    past.hidden = !D.past.length;
    past.innerHTML = '<h2 class="h2">Saisons du classé</h2><ul class="ss-past">' + D.past.map((p) => '<li><span><b>' + esc(p.name) + '</b> · ' + esc(p.rank) + '</span><em>'
      + p.wins + ' V – ' + p.losses + ' D</em><strong>' + (p.reward ? '+' + num(p.reward) + ' crédits' : '—') + '</strong></li>').join('') + '</ul>';
  }
}
