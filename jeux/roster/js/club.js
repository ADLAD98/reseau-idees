/* Le club du joueur, en haut de l'écran Profil : sa carte (blason, nom, sigle, palmarès) et ses cinq infrastructures — des cartes
   « structure » que l'on bâtit et améliore avec ses crédits. Chacune apporte un avantage modeste et durable ; aucune ne rend l'équipe
   plus forte en partie. Le serveur tient les niveaux, les prix et les effets ; ici on affiche et on demande.
   Un serveur plus ancien ne connaît pas le club : rien ne s'affiche alors. */
import { ApiError } from './api.js';
import { esc } from './cards.js';
import { emblemHTML } from './online.js';
import { confirmSheet, num } from './ui.js';

/* G : ce que l'application prête — S (état), call, guard, toast, applyState, now, sfx, expired */
let G = null;
const box = () => document.getElementById('club');
const frDate = (ms) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
/* le dessin de chaque infrastructure, au trait (repère 24 × 24) */
const ART = {
  house: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><rect x="8.8" y="12" width="6.4" height="4.2" rx=".5"/><path d="M12 16.2v1.6M10.3 17.8h3.4"/>',
  bootcamp: '<path d="M12 5 3.2 19.5h17.6z"/><path d="M12 5v14.5M12 19.5l-3-5.4"/><path d="M12 5V2.6l3.6 1.2L12 5"/>',
  academy: '<path d="M2.5 9.6 12 5.2l9.5 4.4L12 14z"/><path d="M6.6 11.7v4c1.6 1.5 3.4 2.2 5.4 2.2s3.8-.7 5.4-2.2v-4"/><path d="M21.5 9.6v5.2"/>',
  scouting: '<circle cx="10.4" cy="10.4" r="6.2"/><path d="m15 15 5.6 5.6"/><path d="m10.4 7.2.95 1.95 2.15.3-1.55 1.5.37 2.15-1.92-1.02-1.92 1.02.37-2.15-1.55-1.5 2.15-.3z"/>',
  arena: '<path d="M3 16.8c0-5 4-9 9-9s9 4 9 9"/><path d="M6.4 16.8c0-3.1 2.5-5.6 5.6-5.6s5.6 2.5 5.6 5.6"/><path d="M2 16.8h20v2.7H2z"/><path d="M12 7.8V5.2M7 9.3 5.8 7.2M17 9.3l1.2-2.1"/>',
};
const artHTML = (id) => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">' + (ART[id] || '') + '</svg>';
/** La teinte du blason d'un club, tirée de son nom (toujours la même pour un même nom). */
export function crestHue(name) {
  let h = 7;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}
/** Le blason d'un club : un écu à sa teinte, son sigle en lettres d'or. */
export const crestHTML = (name, short, cls) => '<div class="cb-crest' + (cls ? ' ' + cls : '') + '" style="--ch:' + crestHue(name) + '" aria-hidden="true"><span style="--n:' + Math.max(2, String(short).length) + '">' + esc(short) + '</span></div>';
const effectOf = (s, level) => s.effect.replace('{v}', s.values[level - 1]);
/** Les infrastructures d'un club, en petit : un pictogramme par infrastructure bâtie, avec son niveau (pour la fiche d'un ami). */
export const structuresLine = (levels) => Object.keys(ART).filter((id) => levels && levels[id]).map((id) => '<span class="cb-mini lv' + levels[id] + '" title="Niveau ' + levels[id] + '">' + artHTML(id) + '<b>' + levels[id] + '</b></span>').join('');

/** L'emplacement du club dans l'écran Profil (rempli quand le serveur a répondu). */
export const clubSectionHTML = () => '<section class="club" id="club" hidden></section>';

function structureHTML(s, view) {
  const S = G.S, built = s.level > 0, short = s.next !== null && S.player.coins < s.next;
  const gate = s.id === 'arena' && built ? view.gate : null;
  return '<article class="cb-s' + (built ? ' lv' + s.level : ' off') + '"><div class="cb-s-art">' + artHTML(s.id) + '</div><b>' + esc(s.name) + '</b>'
    + '<div class="cb-pips" title="Niveau ' + s.level + ' sur ' + s.max + '">' + Array.from({ length: s.max }, (x, k) => '<i' + (k < s.level ? ' class="on"' : '') + '></i>').join('') + '</div>'
    + '<p class="cb-s-fx">' + (built ? esc(effectOf(s, s.level)) + '.' : 'Pas encore bâtie.') + '</p>'
    + (s.next !== null ? '<p class="cb-s-next">Niveau ' + (s.level + 1) + ' : ' + esc(effectOf(s, s.level + 1)) + '.</p>' : '')
    + '<div class="cb-s-acts">'
    + (gate ? (gate.ready ? '<button class="btn primary slim" type="button" data-gate><span class="cb-b"><span>Encaisser</span><span class="cb-sep"> · </span><b>+' + gate.amount + '</b></span></button>' : '<span class="cb-s-done">Billetterie encaissée aujourd\'hui</span>') : '')
    + (s.next !== null ? '<button class="btn slim" type="button" data-build="' + esc(s.id) + '"' + (short ? ' disabled title="Il te manque ' + num(s.next - S.player.coins) + ' crédits"' : '') + '><span class="cb-b"><span>' + (built ? 'Améliorer' : 'Bâtir') + '</span><span class="cb-sep"> · </span><b>' + num(s.next) + '</b></span></button>'
      : '<span class="cb-s-done">Niveau maximum</span>') + '</div></article>';
}
function draw() {
  const el = box();
  if (!el || !G) return;
  const S = G.S, V = S.clubView, p = S.player;
  el.hidden = !V;
  if (!V) return;
  const team = p.team || { name: p.name, short: p.name.slice(0, 4).toUpperCase() }, R = p.ranked;
  const cell = (value, label, cls) => '<div' + (cls ? ' class="' + cls + '"' : '') + '><b>' + value + '</b><span>' + label + '</span></div>';
  el.innerHTML = '<div class="cb-card panel">' + crestHTML(team.name, team.short)
    + '<div class="cb-id"><span class="label">Mon club</span><h2>' + esc(team.name) + '</h2><p>Fondé le ' + frDate(p.createdAt) + ' · sigle ' + esc(team.short) + '</p>'
    + '<div class="cb-level"><b>Niveau ' + V.level + '</b><span class="bar"><i style="width:' + Math.round((100 * V.level) / V.max) + '%"></i></span><em>' + V.level + ' / ' + V.max + '</em></div></div>'
    + '<div class="cb-stats">' + (S.play ? cell(S.play.lineup.rating, 'note d\'équipe') : '') + cell(p.wins + ' – ' + p.losses, 'matchs')
    + (R ? '<div class="cb-rank">' + emblemHTML(R.rank, 'small') + '<span>' + esc(R.rank.label) + '</span></div>' : '')
    + cell(p.titles || 0, (p.titles || 0) > 1 ? 'Mondiaux' : 'Mondial', 'gold') + '</div></div>'
    + '<h3 class="h2">Infrastructures</h3><div class="cb-list">' + V.structures.map((s) => structureHTML(s, V)).join('') + '</div>'
    + '<p class="cb-note">Les infrastructures se bâtissent avec tes crédits et gardent leur niveau pour toujours. Elles ne rendent pas ton équipe plus forte en partie : elles jouent sur ce que ton club gagne et sur son rythme.</p>';
}

/** Demande au serveur l'état du club, puis l'affiche si l'écran Profil est ouvert. */
export async function loadClub(ctx) {
  G = ctx;
  const S = G.S;
  if (!S.club) return;
  if (S.clubView) draw();
  let data = null;
  try { data = await G.call('GET', '/api/club'); } catch (e) { return; }
  S.clubView = data.view;
  draw();
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('#club [data-build], #club [data-gate]');
  if (!b || !G || b.disabled) return;
  const S = G.S, V = S.clubView;
  let res = null;
  if (b.dataset.build) {
    const s = V.structures.find((x) => x.id === b.dataset.build);
    if (!s || s.next === null) return;
    if (!(await confirmSheet((s.level ? 'Améliorer' : 'Bâtir') + ' : ' + s.name, 'Niveau ' + (s.level + 1) + ' pour <b>' + num(s.next) + ' crédits</b> : ' + esc(effectOf(s, s.level + 1)) + '. Il t\'en restera ' + num(S.player.coins - s.next) + '.', s.level ? 'Améliorer' : 'Bâtir'))) return;
    b.disabled = true;
    try { res = await G.call('POST', '/api/club/build', { id: s.id }); } catch (err) {
      if (err instanceof ApiError && err.status === 401) { G.expired(); return; }
      G.toast(err instanceof ApiError ? err.message : 'Un problème est survenu.', true);
      loadClub(G);
      return;
    }
    G.toast(s.name + ' : niveau ' + res.built.level + '.');
    G.sfx.shimmer(3);
  } else {
    b.disabled = true;
    try { res = await G.call('POST', '/api/club/claim'); } catch (err) {
      if (err instanceof ApiError && err.status === 401) { G.expired(); return; }
      G.toast(err instanceof ApiError ? err.message : 'Un problème est survenu.', true);
      loadClub(G);
      return;
    }
    G.toast('Billetterie : +' + res.coins + ' crédits.');
    G.sfx.click();
  }
  G.applyState(res);
  /* (les récompenses annoncées ailleurs ont pu changer : l'écran Jouer et les missions les redemandent à chaque passage) */
  S.clubView = res.view;
  draw();
});
