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
/** Chances de victoire estimées d'après l'écart de note, pour un joueur qui suit les conseils de draft.
    Réglé sur des milliers de matchs complets (outils/essai-equilibre.mjs côté serveur) : à note égale, l'équipe réelle garde
    un léger avantage, parce que ses joueurs se connaissent et jouent leurs champions habituels ; et un remplaçant (subs : leur nombre)
    coûte plus que sa note ne le dit, car il n'a aucun champion de confort. */
export const winChance = (mine, theirs, subs = 0) => 1 / (1 + Math.exp(-0.21 * (mine - theirs - 1.2 - 1.5 * subs)));
/* ---------- les duos des pros et les kits : seulement quand le serveur les donne (catalogue : duos, kits) ---------- */
/** Un duo que les pros associent vraiment cette saison : [parties ensemble, victoires, affinité, valeur pour chacun des deux joueurs],
    ou null. i, j : les postes (0 à 4) ; a, b : les champions. */
export function duoOf(duos, i, a, j, b) {
  if (!duos || !a || !b) return null;
  return duos[i < j ? ROLES[i] + ':' + a + '|' + ROLES[j] + ':' + b : ROLES[j] + ':' + b + '|' + ROLES[i] + ':' + a] || null;
}
/** Ce que ses duos valent à un champion placé à ce poste, aux côtés des champions déjà choisis (1 point au plus) ;
    partner : le partenaire de son premier duo, games : leurs parties ensemble chez les pros. */
export function duoGain(duos, picks, i, id) {
  let sum = 0, partner = null, games = 0;
  picks.forEach((other, j) => {
    const d = other && j !== i ? duoOf(duos, i, id, j, other) : null;
    if (!d) return;
    sum += d[3];
    if (!partner) { partner = other; games = d[0]; }
  });
  return { value: Math.min(1, sum), partner, games };
}
/* la nature d'un ultime et d'un passif, telle que le serveur la lit dans le texte de Riot — et ce qu'il en fait dans la partie */
export const ULT_LABEL = {
  engage: 'immobilise plusieurs ennemis', pick: 'attrape un joueur', aoe: 'dégâts de zone', burst: 'gros dégâts sur une cible', execute: 'achève',
  far: 'très longue portée', protect: 'protège ses alliés', undying: 'empêche de mourir', revive: 'ramène à la vie', self: 'se renforce',
  zone: 'tient une zone', global: 'frappe partout sur la carte', join: 'traverse la carte', reset: 'se relance après une élimination', stealth: 'invisible',
  mobile: 'vitesse', siege: 'abîme les tourelles', scaling: 'grandit toute la partie', gold: 'de l\'or en plus', copy: 'vole un ultime adverse',
};
export const PASSIVE_LABEL = {
  damage: 'dégâts', control: 'immobilise', mobile: 'mobile', tank: 'résistant', sustain: 'se soigne', shield: 'bouclier', stealth: 'invisible',
  scaling: 'grandit toute la partie', gold: 'de l\'or en plus', snowball: 's\'emballe après une élimination', execute: 'achève', siege: 'abîme les tourelles',
  revive: 'seconde vie', afterlife: 'agit encore après sa mort', vision: 'vision', haste: 'ultime plus souvent', xp: 'un niveau d\'avance',
};
/** Ce que les kits d'une composition promettent ensemble — les combinaisons que la simulation récompense. kits : ceux du catalogue
    ([natures de l'ultime, nom du passif, natures du passif, reste du kit]) ; picks : les cinq champions par poste (ou null) ; name(id). */
export function kitCombos(kits, picks, name) {
  if (!kits) return [];
  const list = picks.filter((id) => id && kits[id]).map((id) => ({ id, n: name(id), u: kits[id][0].split(' '), p: kits[id][2].split(' '), k: kits[id][3].split(' ') }));
  const engage = list.filter((x) => x.u.includes('engage')), aoe = list.filter((x) => x.u.includes('aoe') && !x.u.includes('engage'));
  const yasuo = list.find((x) => x.k.includes('needsAir')), air = list.filter((x) => x !== yasuo && x.k.includes('air'));
  const carry = list.find((x) => x.id === picks[3] && (x.u.includes('self') || x.p.includes('scaling') || x.p.includes('snowball')));
  const guard = list.find((x) => x !== carry && x.u.includes('protect'));
  const far = list.filter((x) => x.u.includes('global') || x.u.includes('join'));
  const late = list.filter((x) => x.u.includes('scaling') || x.p.includes('scaling') || x.k.includes('scaling'));
  const notes = [];
  if (engage[0] && aoe[0]) notes.push('Combo d\'ultimes : ' + engage[0].n + ' immobilise, ' + aoe[0].n + ' frappe la zone');
  if (yasuo) notes.push(air.length ? yasuo.n + ' : ' + air.map((x) => x.n).join(', ') + ' pour projeter en l\'air' : yasuo.n + ' sans allié pour projeter en l\'air');
  if (carry && guard) notes.push('Un tireur protégé : ' + guard.n + ' veille sur ' + carry.n);
  if (far.length >= 2) notes.push('Ultimes qui traversent la carte : ' + far.map((x) => x.n).join(', '));
  if (late.length >= 2) notes.push('Force de fin de partie : ' + late.map((x) => x.n).join(', '));
  return notes;
}

/** Écrit un bonus avec son signe et une virgule : +1,5 ou −0,4. */
export const signed = (x) => {
  const v = Math.round(x * 10) / 10;
  return (v > 0 ? '+' : v < 0 ? '−' : '') + String(Math.abs(v)).replace('.', ',');
};
