/* Le profil personnalisé : le blason du joueur — le logo d'une équipe e-sport, débloqué en la battant au moins une fois en match — et sa
   vitrine, jusqu'à cinq cartes de sa collection, que ses amis voient sur sa fiche. Le serveur décide de ce qui est débloqué et vérifie
   que les cartes sont bien à lui ; face à un serveur qui ne connaît pas encore le profil, rien ne s'affiche. */
import { cardHTML, esc, logoHTML, logoUrl } from './cards.js';
import { openSheet, sheetTitle } from './ui.js';

let G = null, D = null;

/** Le losange d'un joueur : le logo de l'équipe qu'il arbore, sinon l'initiale de son pseudo. cls : classes en plus. */
export function avatarHTML(avatar, name, cls = '') {
  if (avatar && logoUrl(avatar)) return '<i class="who-av logo ' + cls + '">' + logoHTML(avatar, 'av-logo', 160) + '</i>';
  return '<i class="who-av ' + cls + '"><span>' + esc(String(name || '?').charAt(0).toUpperCase()) + '</span></i>';
}
/** Une vitrine vue de l'extérieur (la fiche d'un ami). */
export function showcaseHTML(ids, cat) {
  const cards = (ids || []).map((id) => cat.cardById.get(id)).filter(Boolean);
  return cards.length ? '<div class="pfx-shelf">' + cards.map((c) => '<div class="pfx-slot">' + cardHTML(c, cat, {}) + '</div>').join('') + '</div>' : '';
}

export const profileSectionHTML = () => '<section class="pfx" id="pfx" hidden></section>';

export async function loadProfile(ctx) {
  G = ctx;
  try { D = await G.call('GET', '/api/profile'); } catch (e) { D = null; return; }
  draw();
}

function draw() {
  const el = document.getElementById('pfx');
  if (!el || !D) return;
  const S = G.S, cat = S.cat, un = new Set(D.unlocked);
  const teams = D.teams.map((id) => cat.teams.find((t) => t.id === id)).filter(Boolean);
  const current = teams.find((t) => t.id === D.avatar);
  /* la vitrine : cinq emplacements */
  const slots = Array.from({ length: D.max }, (_, k) => {
    const card = D.showcase[k] && cat.cardById.get(D.showcase[k]);
    return card
      ? '<div class="pfx-slot full"><button class="pfx-pick" type="button" data-slot="' + k + '" aria-label="Changer cette carte">' + cardHTML(card, cat, {}) + '</button>'
        + '<button class="pfx-rm" type="button" data-rm="' + k + '" aria-label="Retirer de la vitrine">×</button></div>'
      : '<div class="pfx-slot"><button class="pfx-empty" type="button" data-slot="' + k + '"><b>+</b><span>Ajouter une carte</span></button></div>';
  }).join('');
  /* les logos, ligue par ligue : ceux des équipes battues se choisissent, les autres restent sous cadenas */
  const leagues = [...new Set(teams.map((t) => t.league))];
  const logos = leagues.map((l) => '<div class="pfx-league"><h4>' + esc(l) + '</h4><div class="pfx-logos">'
    + teams.filter((t) => t.league === l).map((t) => {
      const open = un.has(t.id), on = t.id === D.avatar;
      return '<button type="button" class="pfx-logo' + (open ? '' : ' locked') + (on ? ' on' : '') + '" data-logo="' + esc(t.id) + '"'
        + ' title="' + esc(open ? t.name : 'Bats ' + t.name + ' une fois en match pour débloquer son logo') + '"' + (open ? '' : ' aria-disabled="true"') + '>'
        + (logoHTML(t.id, 'pfx-img', 120) || '<span>' + esc(t.short || t.id) + '</span>') + (open ? '' : '<i class="pfx-lock" aria-hidden="true"></i>') + '</button>';
    }).join('') + '</div></div>').join('');
  el.hidden = false;
  el.innerHTML = '<div class="pfx-top">'
    + '<div class="pfx-badge">' + avatarHTML(D.avatar, S.player.name, 'pfx-av') + '<div><span class="eyebrow">Mon blason</span><h3>' + esc(current ? current.name : 'Mon initiale') + '</h3>'
    + '<p>' + un.size + ' logo' + (un.size > 1 ? 's' : '') + ' débloqué' + (un.size > 1 ? 's' : '') + ' sur ' + teams.length + '. Bats une équipe en match pour gagner son logo.</p>'
    + (D.avatar ? '<button class="btn slim" type="button" data-logo="">Reprendre mon initiale</button>' : '') + '</div></div>'
    + '<div class="pfx-show"><span class="eyebrow">Ma vitrine</span><p class="hint">Jusqu\'à ' + D.max + ' cartes de ta collection, que tes amis voient sur ta fiche.</p><div class="pfx-shelf">' + slots + '</div></div></div>'
    + '<details class="pfx-all"' + (un.size ? '' : ' open') + '><summary>Tous les logos d\'équipes <b>' + un.size + ' / ' + teams.length + '</b></summary>' + logos + '</details>';
}

async function save(body) {
  const res = await G.guard(() => G.call('POST', '/api/profile', body));
  if (!res) return;
  D.avatar = res.avatar; D.showcase = res.showcase;
  G.applyState(res);
  /* le losange de l'en-tête prend aussitôt le nouveau logo */
  const who = document.querySelector('.top .who .who-av');
  if (who) who.outerHTML = avatarHTML(D.avatar, G.S.player.name);
  draw();
}

/* choisir une carte pour un emplacement : les cartes possédées, les meilleures d'abord */
function pickCard(k) {
  const S = G.S, cat = S.cat, used = new Set(D.showcase);
  const mine = cat.cards.filter((c) => S.owned.has(c.id) && !used.has(c.id)).sort((a, b) => b.ovr - a.ovr || (b.variant ? 1 : 0) - (a.variant ? 1 : 0)).slice(0, 150);
  const s = openSheet(sheetTitle('Choisir une carte', mine.length ? 'Les plus fortes de ta collection d\'abord' : 'Ta collection est vide pour l\'instant')
    + '<div class="pfx-choose">' + mine.map((c) => '<button type="button" class="pfx-card" data-pick="' + esc(c.id) + '">' + cardHTML(c, cat, {}) + '</button>').join('') + '</div>', { cls: 'pfx-sheet', label: 'Choisir une carte pour la vitrine' });
  s.box.addEventListener('click', (e) => {
    const b = e.target.closest("[data-pick]");
    if (!b) return;
    const next = D.showcase.slice();
    if (k < next.length) next[k] = b.dataset.pick; else next.push(b.dataset.pick);
    s.close();
    save({ showcase: next });
  });
}

document.addEventListener('click', (e) => {
  if (!G || !D || !e.target.closest('#pfx')) return;
  const logo = e.target.closest('[data-logo]');
  if (logo) {
    if (logo.classList.contains('locked')) { G.toast(logo.title, true); return; }
    if (logo.dataset.logo !== D.avatar) save({ avatar: logo.dataset.logo });
    return;
  }
  const rm = e.target.closest('[data-rm]');
  if (rm) { const next = D.showcase.slice(); next.splice(Number(rm.dataset.rm), 1); save({ showcase: next }); return; }
  const slot = e.target.closest('[data-slot]');
  if (slot) pickCard(Number(slot.dataset.slot));
});
