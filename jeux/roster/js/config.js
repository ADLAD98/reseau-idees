/* Réglages du jeu. Le nom affiché et l'adresse du serveur se changent ici, nulle part ailleurs
   (sauf l'adresse du serveur, à reporter aussi dans la ligne « Content-Security-Policy » de index.html). */
export const GAME_NAME = 'Roster';

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
