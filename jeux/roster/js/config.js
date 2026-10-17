/* Réglages du jeu. Le nom affiché et l'adresse du serveur se changent ici, nulle part ailleurs
   (sauf l'adresse du serveur, à reporter aussi dans la ligne « Content-Security-Policy » de index.html). */
export const GAME_NAME = 'Roster';
/* Les hébergeurs, tels que les mentions légales les citent (legal.html). À changer ici — et seulement ici — si le site ou le serveur du
   jeu déménage (Cloudflare Pages, nom de domaine…) : la page des mentions légales se met à jour d'elle-même. L'adresse du site, elle,
   est lue dans la barre d'adresse. */
export const HOSTS = [
  { role: 'Les pages du site, à bcorpslabs.com', name: 'Cloudflare, Inc. (service Workers)', address: '101 Townsend Street, San Francisco, CA 94107, États-Unis', site: 'https://www.cloudflare.com' },
  { role: 'Les pages du site, à l\'ancienne adresse adlad98.github.io', name: 'GitHub, Inc. (service GitHub Pages)', address: '88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis', site: 'https://github.com' },
  { role: 'Le serveur du jeu et sa base de données', name: 'Cloudflare, Inc. (services Workers et D1)', address: '101 Townsend Street, San Francisco, CA 94107, États-Unis', site: 'https://www.cloudflare.com', note: 'les données des comptes sont stockées dans l\'Union européenne' },
];

/* le jeu ouvert sur ce PC (essais) parle au serveur lancé sur ce PC ; le jeu en ligne parle au serveur Cloudflare */
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
export const API_BASE = LOCAL ? 'http://127.0.0.1:8787' : 'https://jeu-cartes.jeu-cartes-serveur.workers.dev';

/* préfixe de tout ce que le jeu garde dans le navigateur */
export const STORE = 'bcorps-cartes-';

/* images officielles des champions (Data Dragon, Riot Games) */
export const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn';
/* photos officielles des joueurs et des coachs, hébergées par Leaguepedia */
export const PHOTOS = 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/';

/* Cartes « prestige » : une lumière fait lentement le tour de leur cadre ; derrière les joueurs titrés, les rayons tournent.
   Les clubs : ceux qui ont gagné un tournoi international depuis 2024 (Worlds, MSI, First Stand, EWC — Leaguepedia, octobre 2026).
   Les joueurs et les coachs : tous ceux qui ont gagné les Worlds ou le MSI, où qu'ils soient aujourd'hui (palmarès lu dans le catalogue). */
export const PRESTIGE_TEAMS = ['T1', 'GEN', 'HLE', 'BLG', 'DK'];

/* La photo propre à une carte légendaire, tant que le serveur ne la donne pas lui-même : Faker en 2025, sous le maillot noir de T1 — un
   portrait pris de plus loin, où on le voit jusqu'à la taille (photo officielle référencée par Leaguepedia). */
export const LEGEND_PHOTOS = { faker: 'd/dd/T1_Faker_2025_Split_1.png' };
/* L'illustration sculptée en relief derrière une légende : celle d'un skin de son champion (identifiant de Data Dragon).
   Faker : « Ahri légende immortalisée » (Ahri_86), le skin du Hall of Legends créé en son honneur en 2024. */
export const LEGEND_ART = { faker: 'Ahri_86' };
/* Ce que la fiche de la carte dit de cette illustration (nom français du skin : Data Dragon ; Hall of Legends, 2024 : Leaguepedia). */
export const LEGEND_ART_NOTE = { faker: 'Derrière lui, sculptée en relief : Ahri « légende immortalisée », le skin créé en son honneur pour son entrée au Hall of Legends, en 2024.' };

/* La musique qui accompagne l'arrivée d'une carte légendaire, par carte : une vidéo de YouTube jouée par son lecteur officiel (le jeu ne
   contient aucun fichier de musique), de la seconde « start » à la seconde « end » — le refrain —, au volume donné (de 0 à 100).
   Faker : « Legends Never Die », l'hymne des Worlds 2017, sur la chaîne officielle de League of Legends. */
export const LEGEND_SONGS = { faker: { video: '4Q46xYqUwZQ', start: 59, end: 84, volume: 30, title: 'Legends Never Die — Worlds 2017' } };

export const ROLE_LABEL = { TOP: 'TOP', JGL: 'JGL', MID: 'MID', BOT: 'ADC', SUP: 'SUP', COACH: 'COACH' };
export const ROLE_NAME = { TOP: 'Toplaner', JGL: 'Jungler', MID: 'Midlaner', BOT: 'ADC', SUP: 'Support', COACH: 'Coach' };
export const ROLE_ORDER = ['TOP', 'JGL', 'MID', 'BOT', 'SUP', 'COACH'];
/* couleur de chaque rang (les mêmes que dans style.css) */
export const TIER_COLOR = { 1: '#b08660', 2: '#b7c3cf', 3: '#d9b45a', 4: '#27d3c4', 5: '#ffe7a8' };

/* les six statistiques d'une carte : [clé, abréviation sur la carte, nom complet, explication] */
export const PLAYER_STATS = [
  ['kda', 'KDA', 'KDA', 'Éliminations et assistances pour une mort'],
  ['dmg', 'DÉG', 'Dégâts', 'Dégâts infligés aux champions par minute'],
  ['farm', 'FARM', 'Farm', 'Sbires et or par minute'],
  ['vis', 'VIS', 'Vision', 'Score de vision par minute'],
  ['kp', 'KP', 'Présence', 'Part des éliminations de l\'équipe auxquelles il participe'],
  ['pool', 'POOL', 'Polyvalence', 'Étendue du répertoire de champions'],
];
export const COACH_STATS = [
  ['str', 'STR', 'Stratégie', 'Taux de victoire de l\'équipe'],
  ['drf', 'DRAFT', 'Draft', 'Variété des champions joués par l\'équipe'],
  ['dis', 'DISC', 'Discipline', 'Peu de morts concédées'],
  ['agr', 'AGR', 'Agressivité', 'Éliminations par minute'],
  ['eco', 'ÉCO', 'Économie', 'Or par minute'],
  ['vis', 'VIS', 'Vision', 'Score de vision par minute'],
];
