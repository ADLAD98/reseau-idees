/* Les règles de la draft, côté affichage : ordre des tours, valeur d'un champion pour un joueur, équilibre d'une composition.
   Ce sont les mêmes calculs que sur le serveur ; ici ils ne servent qu'à conseiller le joueur. C'est toujours le serveur qui juge. */
export const ROLES = ['TOP', 'JGL', 'MID', 'BOT', 'SUP'];

/* Ordre des compétitions : 3 bans chacun, 3 picks chacun (1-2-2-1), 2 bans chacun, 2 picks chacun (1-2-1). B = bleu, R = rouge. */
export const ORDER = 'Bb Rb Bb Rb Bb Rb Bp Rp Rp Bp Bp Rp Rb Bb Rb Bb Rp Bp Bp Rp'.split(' ')
  .map((s) => ({ side: s[0] === 'B' ? 0 : 1, type: s[1] === 'b' ? 'ban' : 'pick' }));
export const PHASES = [[0, 6, 'Bans · première phase'], [6, 12, 'Picks · première phase'], [12, 16, 'Bans · seconde phase'], [16, 20, 'Picks · seconde phase']];

export const CLASS_NAME = { Fighter: 'Combattant', Mage: 'Mage', Assassin: 'Assassin', Tank: 'Tank', Marksman: 'Tireur', Support: 'Enchanteur' };
export const DAMAGE_NAME = { AD: 'dégâts physiques', AP: 'dégâts magiques', MIX: 'dégâts mixtes' };

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
/* les classes se contrent : assassin > mage > combattant > tank > assassin */
const BEATS = { Assassin: 'Mage', Mage: 'Fighter', Fighter: 'Tank', Tank: 'Assassin' };
/* entre supports : l'engagement bat le harcèlement, qui bat le soin, qui bat l'engagement */
const SUP_BEATS = { Tank: 'Mage', Mage: 'Support', Support: 'Tank' };

/** +1 si « a » contre « b » sur cette voie, −1 dans le cas inverse, 0 sinon. */
export function matchup(a, b, role) {
  const table = role === 'SUP' ? SUP_BEATS : BEATS;
  if (table[a.t] === b.t) return 1;
  if (table[b.t] === a.t) return -1;
  return 0;
}
/** Force du champion dans la méta de la saison, d'après sa présence chez les pros. */
export const metaValue = (c) => clamp((c.p - 60) * 0.12, -1.5, 2.2);
/** Parties jouées cette saison par ce joueur sur ce champion : [parties, victoires] ou null. card : null pour un remplaçant. */
export function played(card, champId) {
  const row = card && card.pool ? card.pool.find((p) => p[0] === champId) : null;
  return row ? [row[1], row[2]] : null;
}
/** Confort du joueur sur ce champion. Hors de son répertoire : un malus, plus léger pour un joueur polyvalent. */
export function comfortValue(card, champId) {
  const games = played(card, champId);
  if (games) return Math.min(2.5, 0.5 + 0.75 * Math.log(1 + games[0] / 4));
  if (!card) return -0.8;
  return -clamp(1.6 - (card.stats.pool - 60) / 40, 0.4, 1.6);
}
/** Valeur d'un champion pour un joueur à un poste, face au champion adverse du même poste s'il est déjà connu. */
export function pickValue(champ, champId, card, role, enemy) {
  const meta = metaValue(champ) + (champ.r[0] === role ? 0 : -0.4);
  const comfort = comfortValue(card, champId);
  const counter = enemy ? 0.9 * matchup(champ, enemy, role) : 0;
  return { meta, comfort, counter, total: meta + comfort + counter };
}
/** Ce qu'on sait déjà d'une composition : dégâts physiques et magiques, ligne de front. */
export function compState(list) {
  let ad = 0, ap = 0;
  for (const c of list) { if (c.d === 'AD') ad++; else if (c.d === 'AP') ap++; else { ad += 0.5; ap += 0.5; } }
  return { ad, ap, front: list.some((c) => c.t === 'Tank' || c.t2 === 'Tank'), size: list.length };
}
/** Chances de victoire estimées d'après l'écart de note, à draft égale (réglé sur des milliers de parties simulées). */
export const winChance = (mine, theirs) => 1 / (1 + Math.exp(-0.21 * (mine - theirs)));
/** Écrit un bonus avec son signe et une virgule : +1,5 ou −0,4. */
export const signed = (x) => {
  const v = Math.round(x * 10) / 10;
  return (v > 0 ? '+' : v < 0 ? '−' : '') + String(Math.abs(v)).replace('.', ',');
};
