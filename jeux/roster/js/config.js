/* Réglages du jeu. Le nom affiché et l'adresse du serveur se changent ici, nulle part ailleurs. */
export const GAME_NAME = 'Roster';

/* le jeu ouvert sur ce PC (essais) parle au serveur lancé sur ce PC ; le jeu en ligne parle au serveur Cloudflare */
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
export const API_BASE = LOCAL ? 'http://127.0.0.1:8787' : 'https://jeu-cartes.jeu-cartes-serveur.workers.dev';

/* préfixe de tout ce que le jeu garde dans le navigateur */
export const STORE = 'bcorps-cartes-';

/* images officielles des champions (Data Dragon, Riot Games) */
export const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn';

export const ROLE_LABEL = { TOP: 'TOP', JGL: 'JGL', MID: 'MID', BOT: 'ADC', SUP: 'SUP', COACH: 'COACH' };
export const ROLE_NAME = { TOP: 'Toplaner', JGL: 'Jungler', MID: 'Midlaner', BOT: 'ADC', SUP: 'Support', COACH: 'Coach' };
export const ROLE_ORDER = ['TOP', 'JGL', 'MID', 'BOT', 'SUP', 'COACH'];

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
