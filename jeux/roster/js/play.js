/* L'écran « Jouer » : mon équipe de six (cinq joueurs et un coach), les équipes à affronter, les dernières parties.
   Le serveur calcule les synergies, la note d'équipe et les récompenses ; ici on affiche et on choisit. */
import { ApiError } from './api.js';
import { cardHTML, esc, flagUrl, logoHTML } from './cards.js';
import { ROLE_LABEL, ROLE_NAME } from './config.js';
import { runDraft } from './draft.js';
import { runMatch } from './match.js';
import { bindOnline, onlineHTML } from './online.js';
import { winChance } from './rules.js';
import { worldsBanner } from './worlds.js';

const SLOTS = [['top', 'TOP'], ['jgl', 'JGL'], ['mid', 'MID'], ['bot', 'BOT'], ['sup', 'SUP'], ['coach', 'COACH']];
const POSTE = { TOP: 'ton toplaner', JGL: 'ton jungler', MID: 'ton midlaner', BOT: 'ton ADC', SUP: 'ton support', COACH: 'ton coach' };
const $ = (sel, root) => (root || document).querySelector(sel);
const plural = (n, one, many) => n + ' ' + (n > 1 ? many : one);
const minutes = (sec) => Math.round(sec / 60) + ' min';

/* G : ce que l'application prête à cet écran — S (état), call, guard, toast, applyState, icon, refresh, expired */
let G = null;
const onTab = () => /^#\/?jouer/.test(location.hash) && !!document.getElementById('main');

export async function viewPlay(main, ctx) {
  G = ctx;
  const S = G.S;
  if (S.play) draw(main);
  else main.innerHTML = '<div class="col-head"><div><h1 class="h1">Jouer</h1><p>Compose ton équipe, mène la draft, regarde la partie.</p></div></div><div class="center" style="min-height:30dvh"><div class="spin"></div></div>';
  let data = await G.guard(() => G.call('GET', '/api/play'));
  if (!data) return;
  /* première visite avec des cartes mais aucune équipe : on aligne d'office la meilleure, le joueur la retouchera s'il veut */
  if (!S.autoDeck && S.owned.size && !data.active && SLOTS.every((s) => !data.deck[s[0]])) {
    S.autoDeck = true;
    const best = await G.guard(() => G.call('POST', '/api/deck/auto'));
    if (best) { data = best; G.toast('Ta meilleure équipe est alignée. Touche une carte pour la changer.'); }
  }
  setPlay(data);
  if (onTab()) draw($('#main'));
}
function setPlay(data) {
  G.applyState(data);
  G.S.play = data;
}

/* ---------- dessin de l'écran ---------- */
function draw(main) {
  const S = G.S, P = S.play, cat = S.cat, L = P.lineup;
  const filled = SLOTS.filter((s) => P.deck[s[0]]).length;
  const owns = (role) => [...S.owned.keys()].some((id) => (cat.cardById.get(id) || {}).role === role);
  const slot = (key, role, i) => {
    const card = P.deck[key] ? cat.cardById.get(P.deck[key]) : null;
    const bonus = role === 'COACH' || !card ? 0 : L.players[i].bonus;
    return '<button class="sq-slot' + (card ? '' : ' empty') + '" type="button" data-slot="' + key + '" aria-label="' + ROLE_NAME[role] + (card ? ' : ' + esc(card.name) : ' : poste libre') + '">'
      + '<span class="sq-role">' + ROLE_LABEL[role] + '</span>'
      + (card ? cardHTML(card, cat) + (bonus ? '<span class="badge syn" title="Points de synergie">+' + bonus + '</span>' : '')
        : '<span class="sq-empty"><i>+</i><b>' + ROLE_NAME[role] + '</b><em>' + (owns(role) ? 'Choisir' : 'Aucune carte') + '</em></span>')
      + '</button>';
  };
  const R = P.rules;
  const steps = (table) => table.map((b, n) => [n, b]).filter(([n, b]) => b > 0 && b !== table[n - 1]).map(([n, b]) => n + ' joueurs : +' + b).join(' · ');
  const active = P.active;
  const foeName = (id) => (cat.teamById.get(id) || { name: id }).name;

  main.innerHTML = '<div class="col-head"><div><h1 class="h1">Jouer</h1><p>Compose ton équipe, mène la draft, regarde la partie.</p></div>'
    + '<div class="tally"><div><b>' + S.player.wins + '</b><span>' + (S.player.wins > 1 ? 'victoires' : 'victoire') + '</span></div><div><b>' + S.player.losses + '</b><span>' + (S.player.losses > 1 ? 'défaites' : 'défaite') + '</span></div>'
    + '<div class="gold"><b>' + S.player.coins + '</b><span>crédits</span></div></div></div>'
    + (S.live ? worldsBanner(S) : '')
    + (active ? '<div class="resume panel"><div><b>Draft en cours</b><span>contre ' + esc(foeName(active.opp)) + ' · ' + plural(active.step, 'choix fait', 'choix faits') + ' sur 20</span></div>'
      + '<button class="btn primary" type="button" id="resume">Reprendre</button></div>' : '')
    + '<section class="squad panel"><div class="sq-head"><div class="sq-rating"><b>' + L.rating + '</b><span>Note<br>d\'équipe</span></div>'
    + '<div class="sq-traits">' + (L.traits.length ? L.traits.map(traitHTML).join('')
      : '<p class="hint">' + (!S.owned.size ? 'Tu n\'as pas encore de cartes : ouvre tes packs dans l\'onglet Packs, puis reviens composer ton équipe.' : filled < 2 ? 'Aligne tes cartes : cinq joueurs et un coach.' : 'Aucune synergie pour l\'instant : aligne des joueurs du même club, du même pays ou de la même ligue.') + '</p>') + '</div>'
    + '<button class="btn" type="button" id="auto"' + (S.owned.size ? '' : ' disabled') + '>Meilleure équipe</button></div>'
    + '<div class="sq-slots">' + SLOTS.map((s, i) => slot(s[0], s[1], i)).join('') + '</div>'
    + '<details class="more"><summary>Comment marchent les synergies ?</summary><ul>'
    + '<li><b>Même club</b> — ' + steps(R.club) + ', pour chacun de ces joueurs.</li>'
    + '<li><b>Même pays</b> — ' + steps(R.nation) + '.</li>'
    + '<li><b>Même ligue</b> — les cinq joueurs dans la même ligue : +' + R.league + ' à tous.</li>'
    + '<li><b>Coach</b> — +' + R.coach + ' à chaque joueur de son club. Sa propre note compte pour 8 % de la note d\'équipe.</li>'
    + '<li>Un joueur ne gagne jamais plus de ' + R.max + ' points. Un poste laissé vide est tenu par un remplaçant noté ' + R.sub + '.</li>'
    + '</ul></details></section>'
    /* les parties en ligne : rapide, classée (rien si le serveur ne les propose pas) */
    + onlineHTML(G)
    + '<section><h2 class="h2">Adversaires</h2><div class="foe-bar"><div class="pills" id="leagues">'
    + [['', 'Toutes']].concat(cat.leagues.map((l) => [l.id, l.name])).map((l) => '<button type="button" data-league="' + l[0] + '"' + ((S.playLeague || '') === l[0] ? ' class="on"' : '') + '>' + esc(l[1]) + '</button>').join('')
    + '</div><span class="count">La première victoire contre une équipe rapporte un pack.</span></div><div class="foes" id="foes"></div></section>'
    + '<section><h2 class="h2">Dernières parties</h2>' + (P.history.length ? '<div class="hist">' + P.history.map(histHTML).join('') + '</div>'
      : '<p class="empty">Aucune partie jouée. Choisis un adversaire ci-dessus.</p>') + '</section>';
  drawFoes();
  bindOnline(main);

  main.querySelectorAll('[data-slot]').forEach((b) => b.addEventListener('click', () => pickSlot(b.dataset.slot)));
  $('#auto').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    const data = await G.guard(() => G.call('POST', '/api/deck/auto'));
    if (data) { setPlay(data); G.toast('Meilleure équipe alignée : note ' + data.lineup.rating + '.'); }
    if (onTab()) draw($('#main'));
  });
  $('#leagues').addEventListener('click', (e) => {
    const b = e.target.closest('[data-league]');
    if (!b) return;
    S.playLeague = b.dataset.league;
    $('#leagues').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    drawFoes();
  });
  $('#foes').addEventListener('click', (e) => { const b = e.target.closest('[data-foe]'); if (b) showFoe(b.dataset.foe); });
  if (active) $('#resume').addEventListener('click', () => playMatch(active));
  main.querySelectorAll('[data-replay]').forEach((b) => b.addEventListener('click', () => watch(Number(b.dataset.replay), b)));
}

function traitHTML(t) {
  const label = t.kind === 'coach' ? 'Coach ' + esc(t.label) : esc(t.label);
  return '<span class="trait"' + (t.kind === 'league' ? '' : ' title="' + plural(t.count, 'joueur', 'joueurs') + '"') + '>'
    + (t.kind === 'country' ? '<img src="' + flagUrl(t.key) + '" alt="">' : '<i></i>')
    + '<span>' + label + (t.kind === 'league' ? '' : ' <em>×' + t.count + '</em>') + '</span><b>+' + t.bonus + '</b></span>';
}

function drawFoes() {
  const S = G.S, P = S.play, cat = S.cat, mine = P.lineup.rating;
  const list = P.opponents.filter((o) => !S.playLeague || o.league === S.playLeague);
  $('#foes').innerHTML = list.map((o) => {
    const team = cat.teamById.get(o.id), gap = o.rating - mine;
    const level = gap >= 9 ? ['hard', 'Très difficile'] : gap >= 4 ? ['hard', 'Difficile'] : gap >= -3 ? ['fair', 'À ta portée'] : ['easy', 'Abordable'];
    return '<button class="foe ' + level[0] + (o.wins ? ' beaten' : '') + '" type="button" data-foe="' + esc(o.id) + '">'
      + logoHTML(o.id, 'logo foe-l', 80) + '<span class="foe-r">' + o.rating + '</span>'
      + '<span class="foe-n"><b>' + esc(team.name) + '</b><i>' + esc(o.league) + ' · ' + level[1] + (o.wins || o.losses ? ' · ' + o.wins + ' V – ' + o.losses + ' D' : '') + '</i></span>'
      + '<span class="foe-w"><b>+' + o.win.coins + '</b>' + (o.wins ? '' : '<i title="Un pack à gagner">' + G.icon('i-pack') + '</i>') + '</span></button>';
  }).join('');
}

function histHTML(m) {
  const cat = G.S.cat, team = cat.teamById.get(m.opp);
  const mine = m.score ? m.score[m.side] : 0, theirs = m.score ? m.score[1 - m.side] : 0;
  return '<div class="hist-row ' + (m.won ? 'win' : 'lose') + '"><b>' + (m.won ? 'Victoire' : 'Défaite') + '</b>'
    + '<span class="hist-foe">contre ' + esc(team ? team.name : m.opp) + '</span>'
    + '<span class="hist-score">' + mine + ' – ' + theirs + (m.duration ? ' · ' + minutes(m.duration) : '') + '</span>'
    + '<span class="hist-coins">+' + (m.coins || 0) + '</span>'
    + (m.replay ? '<button class="btn" type="button" data-replay="' + m.id + '">Revoir</button>' : '<span></span>') + '</div>';
}

/* ---------- choisir la carte d'un poste ---------- */
function pickSlot(key) {
  const S = G.S, P = S.play, cat = S.cat, role = SLOTS.find((s) => s[0] === key)[1];
  const current = P.deck[key];
  const list = [...S.owned.keys()].map((id) => cat.cardById.get(id)).filter((c) => c && c.role === role).sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name));
  /* les autres cartes déjà alignées : pour signaler les synergies possibles */
  const mates = SLOTS.filter((s) => s[0] !== key && s[1] !== 'COACH' && P.deck[s[0]]).map((s) => cat.cardById.get(P.deck[s[0]])).filter(Boolean);
  const coach = P.deck.coach ? cat.cardById.get(P.deck.coach) : null;
  const links = (c) => {
    const out = [];
    const club = mates.filter((m) => m.team === c.team).length;
    if (role === 'COACH') {
      if (club) out.push(plural(club, 'joueur', 'joueurs') + ' de son club');
    } else {
      const land = c.country ? mates.filter((m) => m.country === c.country).length : 0;
      if (club) out.push(plural(club, 'coéquipier', 'coéquipiers'));
      if (land) out.push(plural(land, 'compatriote', 'compatriotes'));
      if (coach && coach.team === c.team) out.push('son coach');
    }
    return out;
  };
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = '<div class="sheet-box panel picker" role="dialog" aria-modal="true" aria-label="Choisir ' + POSTE[role] + '">'
    + '<div class="sheet-title"><div><h2>Choisir ' + POSTE[role] + '</h2><p>' + (list.length ? plural(list.length, 'carte possédée', 'cartes possédées') + ' à ce poste' : 'Tu n\'as encore aucune carte à ce poste.') + '</p></div>'
    + '<span class="spacer"></span><button class="close" type="button" aria-label="Fermer">' + G.icon('i-close') + '</button></div>'
    + (list.length ? '<div class="pick-grid">' + list.map((c) => {
      const l = links(c);
      return '<button class="pick' + (c.id === current ? ' on' : '') + '" type="button" data-pick="' + esc(c.id) + '">' + cardHTML(c, cat)
        + '<span class="pick-note">' + (c.id === current ? '<b>En place</b>' : l.length ? esc(l.join(' · ')) : '&nbsp;') + '</span></button>';
    }).join('') + '</div>'
      : '<p class="empty">Ouvre des packs pour trouver ' + (role === 'COACH' ? 'un coach' : 'un joueur à ce poste') + '. En attendant, ' + (role === 'COACH' ? 'l\'équipe joue sans coach.' : 'un remplaçant tient le poste.') + '</p>')
    + (current ? '<div class="actions"><button class="btn" type="button" data-pick="">Laisser le poste vide</button></div>' : '')
    + '</div>';
  const close = () => { sheet.remove(); document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  sheet.addEventListener('click', async (e) => {
    if (e.target === sheet || e.target.closest('.close')) { close(); return; }
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    const id = b.dataset.pick || null;
    if (id === current) { close(); return; }
    sheet.querySelectorAll('[data-pick]').forEach((x) => { x.disabled = true; });
    const data = await G.guard(() => G.call('POST', '/api/deck', Object.assign({}, P.deck, { [key]: id })));
    close();
    if (data) setPlay(data);
    if (onTab()) draw($('#main'));
  });
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(sheet);
}

/* ---------- avant le match : l'équipe adverse, les chances, les récompenses ---------- */
function showFoe(id) {
  const S = G.S, P = S.play, cat = S.cat, o = P.opponents.find((x) => x.id === id);
  if (!o) return;
  const team = cat.teamById.get(id), league = cat.leagues.find((l) => l.id === o.league);
  const subs = P.lineup.players.filter((p) => !p.id).length;
  const mine = P.lineup.rating, chance = Math.min(95, Math.max(5, Math.round(winChance(mine, o.rating, subs) * 20) * 5));
  const cards = o.players.concat([o.coach]).map((cid) => (cid ? cat.cardById.get(cid) : null)).filter(Boolean);
  const empty = SLOTS.filter((s) => !P.deck[s[0]]).length;
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = '<div class="sheet-box panel prematch" role="dialog" aria-modal="true" aria-label="' + esc(team.name) + '">'
    + '<div class="sheet-title"><div><h2>' + esc(team.name) + '</h2><p>' + esc(o.league) + (league ? ' · ' + esc(league.region) : '') + (o.wins || o.losses ? ' · ton bilan : ' + o.wins + ' V – ' + o.losses + ' D' : '') + '</p></div>'
    + '<span class="spacer"></span><button class="close" type="button" aria-label="Fermer">' + G.icon('i-close') + '</button></div>'
    + '<div class="duel"><div><b>' + mine + '</b><span>Ton équipe</span></div><i>VS</i><div><b>' + o.rating + '</b><span>' + esc(team.short) + '</span></div></div>'
    + '<div class="odds-bar"><div class="bar"><i style="width:' + chance + '%"></i></div><p>Chances de victoire estimées avant la draft : <b>environ ' + chance + ' %</b>. Une bonne draft peut tout changer.</p></div>'
    + '<div class="foe-cards">' + cards.map((c) => cardHTML(c, cat)).join('') + '</div>'
    + '<div class="prizes"><div><span>Victoire</span><b>+' + o.win.coins + ' crédits</b>' + (o.wins ? '' : '<em>+ 1 pack (première victoire)</em>') + (o.win.easy ? '<em class="dim">adversaire bien plus faible : gain réduit</em>' : '') + '</div>'
    + '<div><span>Défaite</span><b>+' + P.rewards.loss + ' crédits</b></div></div>'
    + (empty ? '<p class="note warn">' + (empty > 1 ? empty + ' postes sont vides' : 'Un poste est vide') + ' dans ton équipe : ' + (empty > 1 ? 'des remplaçants joueront' : 'un remplaçant jouera') + ' à la place.</p>' : '')
    + (P.active ? '<p class="note warn">Ta draft en cours contre ' + esc((cat.teamById.get(P.active.opp) || { name: P.active.opp }).name) + ' sera abandonnée.</p>' : '')
    /* (la draft simulée : le coach fait tous les choix d'un trait — proposée quand le serveur sait la jouer) */
    + '<div class="actions"><button class="btn primary big" type="button" id="go">Lancer la draft</button>'
    + (G.S.shop ? '<button class="btn big" type="button" id="goSim" title="Ton coach fait toute la draft à ta place, selon son talent : on passe directement à la partie.">Simuler la draft</button>' : '') + '</div>'
    + '<p class="note">Le côté (bleu ou rouge) est tiré au sort. Le bleu choisit en premier, le rouge a le dernier mot.</p></div>';
  const close = () => { sheet.remove(); document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  sheet.addEventListener('click', async (e) => {
    if (e.target === sheet || e.target.closest('.close')) { close(); return; }
    const sim = !!e.target.closest('#goSim');
    if (!sim && !e.target.closest('#go')) return;
    sheet.querySelectorAll('#go, #goSim').forEach((b) => { b.disabled = true; });
    const res = await G.guard(() => G.call('POST', '/api/match/start', { team: id }));
    close();
    if (res) playMatch(res.match, sim);
  });
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(sheet);
}

/* ---------- le match : draft, puis partie ---------- */
async function playMatch(match, instant) {
  const S = G.S;
  if (S.busy) return;
  S.busy = true;
  let goTo = 'jouer';
  try {
    const out = await runDraft({
      match, cat: S.cat, fx: S.fx, toast: G.toast, instant: !!instant,
      /* un joueur qui n'a encore jamais joué voit d'abord les règles de la draft (sauf s'il a demandé à la simuler) */
      help: !instant && S.player.wins + S.player.losses === 0 && match.log.length < 2,
      act: (body) => G.call('POST', '/api/match/act', body),
      /* en cas de désaccord avec le serveur, on repart de ce qu'il a en mémoire */
      resync: async () => (await G.call('GET', '/api/play')).active,
    });
    if (out.final) {
      G.applyState(out.final);
      goTo = (await runMatch({ data: out.final, cat: S.cat, fx: S.fx })).goTo;
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) { S.busy = false; G.expired(); return; }
    G.toast(e instanceof ApiError ? e.message : 'Un problème est survenu.', true);
    if (!(e instanceof ApiError)) console.error(e);
  }
  S.busy = false;
  if (goTo === 'packs') location.hash = '#/packs';
  else G.refresh();
}

/* revoir une partie de l'historique */
async function watch(id, button) {
  const S = G.S;
  if (S.busy) return;
  button.disabled = true;
  const data = await G.guard(() => G.call('GET', '/api/match/replay?id=' + id));
  button.disabled = false;
  if (!data) return;
  S.busy = true;
  try {
    await runMatch({ data, cat: S.cat, fx: S.fx });
  } catch (e) {
    console.error(e);
    G.toast('Un problème est survenu.', true);
  }
  S.busy = false;
}
