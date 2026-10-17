/* « Pendant ton absence » (serveur : recap.ts) : à l'ouverture du jeu, si la dernière visite sur cet appareil date d'au moins une heure,
   une petite fenêtre dit ce qui s'est passé depuis — pronostics réglés, cartes vendues, échanges proposés, défis lancés, demandes d'amis,
   pack prêt —, chaque ligne menant à son écran. Rien si seul le pack attend (la page des packs le dit déjà). La dernière visite se garde
   dans ce navigateur, joueur par joueur. Face à un serveur qui ne connaît pas /api/recap : rien. */
import { STORE } from './config.js';
import { num, openSheet, plural, sheetTitle } from './ui.js';

const HOUR = 3600000;
let G = null, started = false;
const key = () => STORE + 'visite-' + G.S.player.id;
const stamp = () => { try { if (G && G.S.player) localStorage.setItem(key(), String(Date.now())); } catch (e) { /* pas de mémoire : pas de récapitulatif */ } };
const WHEN = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/* chaque nouvelle : [texte, adresse, bouton] */
const LINES = {
  pronostics: (x) => [plural(x.count, 'pronostic réglé', 'pronostics réglés') + (x.good ? ' : ' + plural(x.good, 'gagné', 'gagnés') + ', <b>+' + num(x.coins) + ' crédits</b>' : ' : aucun de gagné cette fois'), '#/packs/matchs', 'Voir'],
  ventes: (x) => [plural(x.count, 'carte vendue', 'cartes vendues') + ' au marché, <b>+' + num(x.coins) + ' crédits</b>', '#/marche', 'Voir'],
  echanges: (x) => [plural(x.count, 'proposition', 'propositions') + ' d\'échange', '#/joueurs', 'Répondre'],
  defis: (x) => [plural(x.count, 'défi lancé', 'défis lancés') + ' par un ami', '#/joueurs', 'Répondre'],
  amis: (x) => [plural(x.count, 'demande', 'demandes') + ' d\'ami', '#/joueurs', 'Voir'],
  pack: (x) => [x.count > 1 ? x.count + ' packs t\'attendent' : 'Ton pack gratuit est prêt', '#/packs', 'Ouvrir'],
};

/** À appeler une fois le joueur connecté (app.js, shell) : note la visite, et montre ce qui s'est passé depuis la précédente. */
export async function startRecap(ctx) {
  G = ctx;
  if (started) return;
  started = true;
  let last = 0;
  try { last = Number(localStorage.getItem(key())) || 0; } catch (e) { last = 0; }
  stamp();
  setInterval(stamp, 60000);
  addEventListener('pagehide', stamp);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stamp(); });
  if (!last || Date.now() - last < HOUR) return;
  let data = null;
  try { data = await G.call('GET', '/api/recap?since=' + last); } catch (e) { return; }
  if (!data || !data.items.some((x) => x.kind !== 'pack')) return;
  /* une autre fenêtre (le code de secours, l'ouverture d'un pack, une partie) passe d'abord */
  const show = () => {
    if (document.querySelector('.sheet, .op, .mv, .rc-box, .insp')) { setTimeout(show, 1500); return; }
    const sheet = openSheet(sheetTitle('Pendant ton absence', 'Depuis ' + WHEN.format(data.since))
      + '<ul class="recap">' + data.items.map((x) => { const [text, href, btn] = LINES[x.kind] ? LINES[x.kind](x) : [null]; return text ? '<li><span>' + text + '</span><a class="btn" href="' + href + '">' + btn + '</a></li>' : ''; }).join('') + '</ul>'
      + '<div class="actions"><button class="btn primary" type="button" data-recap="ok">C\'est noté</button></div>', { cls: 'recap-box', label: 'Pendant ton absence' });
    sheet.el.addEventListener('click', (e) => { if (e.target.closest('a[href], [data-recap]')) { if (G.sfx) G.sfx.click(); sheet.close(); } });
  };
  show();
}
