/* Le parrainage (serveur : parrainage.ts) : dans le Profil, le lien du joueur à partager, et ce qu'il lui a déjà rapporté. Un ami inscrit
   par ce lien gagne un pack à son premier match, et le parrain aussi. Face à un serveur qui ne connaît pas le parrainage : rien. */
import { esc } from './cards.js';

const SHORT = 'https://roster.bcorpslabs.com/?parrain=';

export const referralSectionHTML = () => '<section class="panel ref" id="ref" hidden></section>';

export async function loadReferral(G) {
  let d = null;
  try { d = await G.call('GET', '/api/referral'); } catch (e) { return; }
  const el = document.getElementById('ref');
  if (!el || !d || !d.code) return;
  const link = SHORT + d.code, won = Math.min(d.rewarded, d.max);
  el.hidden = false;
  el.innerHTML = '<h3>Parrainage</h3>'
    + '<p class="hint">Invite tes amis avec ton lien : quand un ami a joué son premier match, vous gagnez chacun un pack (pour tes ' + d.max + ' premiers amis).</p>'
    + '<div class="ref-link"><code translate="no">' + esc(link) + '</code><button class="btn primary" type="button" id="refShare">Partager</button></div>'
    + '<p class="ref-stats">' + (d.invited
      ? '<b>' + d.invited + '</b> ami' + (d.invited > 1 ? 's' : '') + ' inscrit' + (d.invited > 1 ? 's' : '') + ' par ton lien · <b>' + won + '</b> pack' + (won > 1 ? 's' : '') + ' gagné' + (won > 1 ? 's' : '')
      : 'Personne ne s\'est encore inscrit par ton lien.') + '</p>';
  document.getElementById('refShare').onclick = async () => {
    G.sfx.click();
    const text = 'Viens jouer à Roster avec moi, un jeu de cartes e-sport gratuit : avec ce lien, on gagne chacun un pack !';
    /* sur un téléphone, son menu de partage ; sur un ordinateur, le lien copié */
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ title: 'Roster', text, url: link }); } catch (e) { /* annulé */ } return; }
    try { await navigator.clipboard.writeText(link); G.toast('Lien copié : envoie-le à tes amis.'); } catch (e) { window.prompt('Copie ce lien :', link); }
  };
}
