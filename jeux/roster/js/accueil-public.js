/* La présentation publique de Roster, sous l'écran de connexion : ce qu'on y fait, en quatre blocs, le vrai match en cours s'il y en a
   un, et un bouton « Jouer gratuitement » qui ouvre l'inscription. C'est ce que voit un visiteur venu d'un lien (Discord, un ami, un
   moteur de recherche). */
import { esc } from './cards.js';

const FEATURES = [
  ['i-pack', 'Des packs, de vrais pros', (n) => 'Plus de ' + n + ' cartes : les joueurs et les coachs des ligues majeures (LCK, LPL, LEC, LCS, LCP, CBLOL), en versions holographique, full art et légendaire.'],
  ['i-play', 'Ta draft, ta partie', () => 'Compose ton équipe, fais la draft des champions contre une vraie équipe pro, puis regarde la partie se jouer, action par action.'],
  ['i-live', 'Les vrais matchs', () => 'Pronostique les matchs officiels (les Worlds en ce moment) et suis-les en direct. La note des pros bouge chaque semaine selon leurs vrais matchs.'],
  ['i-trophy', 'Défis et classé', () => 'Missions du jour, défis de la semaine, événements, et des parties classées contre les autres joueurs, saison après saison.'],
];

/** La présentation, à placer après le formulaire de connexion. n : le nombre de cartes du catalogue (arrondi). */
export function publicHTML(n, live) {
  const round = Math.floor(n / 50) * 50;
  return '<section class="pub">'
    + (live ? publicLiveHTML(live) : '')
    + '<h2 class="pub-title">Le jeu de cartes de l\'e‑sport League of Legends</h2>'
    + '<p class="pub-lead">Gratuit, sans publicité, sans achat : tout se gagne en jouant. Il suffit d\'un pseudo et d\'un mot de passe, aucune adresse e-mail.</p>'
    + '<div class="pub-grid">' + FEATURES.map(([icon, title, text]) => '<article class="pub-card panel"><b>' + esc(title) + '</b><p>' + esc(text(round)) + '</p></article>').join('') + '</div>'
    + '<div class="pub-cta"><button class="btn primary big" type="button" data-public="join">Jouer gratuitement</button></div>'
    + '</section>';
}

/** La ligne « En direct » d'un vrai match en cours (GET /api/live). */
export const publicLiveHTML = (m) => '<p class="pub-live"><i class="pr-dot" aria-hidden="true"></i><b>En direct</b> ' + esc(m.leagueName) + ' · ' + esc(m.teams[0].code) + ' <strong>' + m.teams[0].wins + '–' + m.teams[1].wins + '</strong> ' + esc(m.teams[1].code) + '</p>';
