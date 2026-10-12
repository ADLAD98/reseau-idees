/* L'onglet « Joueurs » : amis, demandes, échanges de cartes, classement.
   Le serveur garde tout (amitiés, propositions, cartes) ; ici on affiche et on demande. */
import { ApiError } from './api.js';
import { cardHTML, esc } from './cards.js';
import { crestHTML, structuresLine } from './club.js';
import { confirmSheet, openSheet, plural, sheetTitle, since } from './ui.js';

const $ = (sel, root) => (root || document).querySelector(sel);
const NAME_RULE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,15}$/;
const FORMATS = [[1, '1 partie'], [3, 'BO3'], [5, 'BO5']];
/** L'initiale d'un pseudo, pour le losange qui le précède. */
const initial = (name) => esc(String(name).charAt(0).toUpperCase());

/* G : ce que l'application prête à cet écran — S (état), call, guard, toast, applyState, icon, refresh, now, owned(id, qty), duel */
let G = null;
const onTab = () => /^#\/?joueurs/.test(location.hash) && !!document.getElementById('main');
const frDate = (ms) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
/** Une petite carte cliquable (sa fiche s'ouvre), pour montrer une carte dans une proposition. */
const mini = (id, extra) => {
  const card = G.S.cat.cardById.get(id);
  return card ? '<button class="tile mini" type="button" data-card="' + esc(id) + '" aria-label="' + esc(card.name) + '">' + cardHTML(card, G.S.cat) + (extra || '') + '</button>' : '';
};

export async function viewSocial(main, ctx) {
  G = ctx;
  const S = G.S;
  if (!S.social) S.social = { tab: 'amis', friends: null, trades: null, board: null, duels: null };
  draw(main);
  await load();
  if (onTab()) draw($('#main'));
}
/** Recharge ce que montre le sous-onglet ouvert (les amis et les échanges vont ensemble : leurs pastilles se répondent). */
async function load() {
  const so = G.S.social;
  if (so.tab === 'classement') {
    const data = await G.guard(() => G.call('GET', '/api/leaderboard'));
    if (data) so.board = data;
    return;
  }
  const [friends, trades, duels] = await Promise.all([
    G.guard(() => G.call('GET', '/api/friends')),
    G.guard(() => G.call('GET', '/api/trades')),
    so.tab === 'amis' ? G.guard(() => G.call('GET', '/api/duels')) : null,
  ]);
  if (friends) so.friends = friends;
  if (trades) so.trades = trades;
  if (duels) so.duels = duels.duels;
}
const reload = async () => { await load(); if (onTab()) draw($('#main')); G.pulse(); };

function draw(main) {
  const S = G.S, so = S.social, online = S.pulse ? S.pulse.online : 0;
  const asks = so.friends ? so.friends.requests.length : S.pulse ? S.pulse.inbox.friends : 0;
  const offers = so.trades ? so.trades.received.length : S.pulse ? S.pulse.inbox.trades : 0;
  const tab = (id, label, n) => '<button type="button" data-st="' + id + '"' + (so.tab === id ? ' class="on"' : '') + '>' + label + (n ? '<em>' + n + '</em>' : '') + '</button>';
  /* en tête : mes amis, ceux qui sont là, mon palmarès des défis */
  const F = so.friends, P = S.player;
  main.innerHTML = '<div id="soc"><div class="col-head"><div><h1 class="h1">Joueurs</h1><p class="soc-online"><i class="dot on"></i>' + (online > 1 ? online + ' joueurs en ligne' : online === 1 ? 'Toi seul en ligne pour l\'instant' : 'Connexion…') + '</p></div>'
    + '<div class="tally"><div><b>' + (F ? F.friends.length : '–') + '</b><span>' + (F && F.friends.length > 1 ? 'amis' : 'ami') + '</span></div>'
    + '<div><b>' + (F ? F.friends.filter((f) => f.online).length : '–') + '</b><span>amis en ligne</span></div>'
    + (S.live ? '<div class="gold"><b>' + (P.duelWins || 0) + '<small> V</small> ' + (P.duelLosses || 0) + '<small> D</small></b><span>défis en direct</span></div>' : '') + '</div></div>'
    + '<div class="seg soc-tabs" id="socTabs">' + tab('amis', 'Amis', asks) + tab('echanges', 'Échanges', offers) + tab('classement', 'Classement', 0) + '</div>'
    + '<div id="socBody">' + (so.tab === 'amis' ? friendsHTML() : so.tab === 'echanges' ? tradesHTML() : boardHTML()) + '</div></div>';
  $('#socTabs').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-st]');
    if (!b || b.dataset.st === so.tab) return;
    so.tab = b.dataset.st;
    draw(main);
    await load();
    if (onTab()) draw($('#main'));
  });
  bind(main);
}
const spinner = '<div class="center" style="min-height:26dvh"><div class="spin"></div></div>';

/* ---------- amis ---------- */
function friendsHTML() {
  const so = G.S.social, F = so.friends;
  if (!F) return spinner;
  const now = G.now();
  const row = (f) => '<div class="soc-row' + (f.online ? ' on' : '') + '"><i class="soc-av' + (f.online ? ' on' : '') + '"><span>' + initial(f.name) + '</span></i>'
    + '<button class="soc-who" type="button" data-open="' + f.id + '"><b>' + esc(f.name) + (f.titles ? '<u title="Mondiaux remportés">' + f.titles + ' ★</u>' : '') + '</b>'
    + '<i>' + (f.online ? 'En ligne' : 'Vu ' + since(now - f.seenAt)) + ' · équipe ' + f.rating + ' · ' + f.cards + ' cartes' + (f.duelWins + f.duelLosses ? ' · défis ' + f.duelWins + ' V – ' + f.duelLosses + ' D' : '') + '</i></button>'
    + '<span class="soc-acts"><button class="btn primary" type="button" data-open="' + f.id + '" data-focus="duel">Défier</button><button class="btn" type="button" data-trade="' + f.id + '" data-name="' + esc(f.name) + '">Échanger</button></span></div>';
  const ask = (r) => '<div class="soc-row ask"><i class="soc-av"><span>' + initial(r.name) + '</span></i><span class="soc-who"><b>' + esc(r.name) + '</b><i>veut devenir ton ami · ' + since(now - r.at) + '</i></span>'
    + '<span class="soc-acts"><button class="btn primary" type="button" data-answer="' + r.id + '" data-yes="1">Accepter</button><button class="btn" type="button" data-answer="' + r.id + '">Refuser</button></span></div>';
  const sent = (r) => '<div class="soc-row"><i class="soc-av"><span>' + initial(r.name) + '</span></i><span class="soc-who"><b>' + esc(r.name) + '</b><i>demande envoyée ' + since(now - r.at) + '</i></span>'
    + '<span class="soc-acts"><button class="btn" type="button" data-remove="' + r.id + '">Annuler</button></span></div>';
  /* (mode : une partie rapide ou classée figure ici aussi, sous son nom ; lp : les points de ligue qu'elle a déplacés) */
  const duel = (d) => '<div class="hist-row ' + (d.won ? 'win' : 'lose') + '"><b>' + (d.won ? 'Victoire' : 'Défaite') + '</b><span class="hist-foe">' + (d.mode === 'quick' ? 'Partie rapide · ' : d.mode === 'ranked' ? 'Classé · ' : '')
    + 'contre ' + esc(d.foe) + (d.bot ? ' (son équipe, dirigée par l\'ordinateur)' : '') + '</span>'
    + '<span class="hist-score">' + (d.format > 1 ? 'BO' + d.format + ' · ' : '') + d.wins[0] + ' – ' + d.wins[1] + (d.forfeit ? ' · forfait' : '')
    + (typeof d.lp === 'number' ? ' · ' + (d.lp < 0 ? '−' : '+') + Math.abs(d.lp) + ' points de ligue' : '') + '</span><span class="hist-coins">+' + d.coins + '</span><span></span></div>';
  return '<form class="soc-add" id="addFriend" novalidate><div class="soc-add-in"><input class="inp" name="name" placeholder="Pseudo d\'un joueur" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Pseudo du joueur à ajouter">'
    + '<div class="soc-suggest" id="suggest" hidden></div></div><button class="btn primary" type="submit">Ajouter en ami</button></form>'
    + (F.requests.length ? '<section><h2 class="h2">Demandes reçues</h2><div class="soc-list">' + F.requests.map(ask).join('') + '</div></section>' : '')
    + '<section><h2 class="h2">Mes amis' + (F.friends.length ? ' · ' + F.friends.length : '') + '</h2>'
    + (F.friends.length ? '<div class="soc-list">' + F.friends.map(row).join('') + '</div>'
      : '<p class="empty">Pas encore d\'ami. Tape le pseudo d\'un joueur ci-dessus : dès qu\'il accepte, vous pouvez vous défier et échanger des cartes.</p>') + '</section>'
    + (F.asked.length ? '<section><h2 class="h2">Demandes envoyées</h2><div class="soc-list">' + F.asked.map(sent).join('') + '</div></section>' : '')
    /* les autres joueurs connectés en ce moment : un bouton pour leur demander d'être amis */
    + (F.online && F.online.length ? '<section><h2 class="h2">En ligne en ce moment</h2><div class="soc-chips">' + F.online.map((p) => '<span class="soc-chip"><i class="dot on"></i><b>' + esc(p.name) + '</b>'
      + '<button class="btn slim" type="button" data-ask="' + esc(p.name) + '">+ Ami</button></span>').join('') + '</div></section>' : '')
    + (so.duels && so.duels.length ? '<section><h2 class="h2">Derniers défis</h2><div class="hist">' + so.duels.map(duel).join('') + '</div></section>' : '');
}

/* ---------- échanges ---------- */
function tradesHTML() {
  const T = G.S.social.trades, now = G.now();
  if (!T) return spinner;
  const side = (label, ids) => '<div class="tr-part"><span>' + label + '</span><div class="tr-cards">' + (ids.length ? ids.map((id) => mini(id)).join('') : '<p class="tr-none">rien</p>') + '</div></div>';
  const offer = (t, actions, head) => '<div class="tr-offer panel"><div class="tr-head"><p>' + head + '</p><span>' + since(now - (t.closedAt || t.at)) + '</span></div>'
    + '<div class="tr-swap">' + side('Tu reçois', t.get) + '<i aria-hidden="true">⇄</i>' + side('Tu donnes', t.give) + '</div>' + (actions ? '<div class="actions">' + actions + '</div>' : '') + '</div>';
  const STATUS = { done: 'Échange conclu', no: 'Refusé', back: 'Annulé' };
  return (T.received.length ? '<section><h2 class="h2">Propositions reçues</h2><div class="tr-list">' + T.received.map((t) => offer(t,
    '<button class="btn primary" type="button" data-tanswer="' + t.id + '" data-yes="1">Accepter</button><button class="btn" type="button" data-tanswer="' + t.id + '">Refuser</button>',
    '<b>' + esc(t.with.name) + '</b> te propose un échange')).join('') + '</div></section>' : '')
    + (T.sent.length ? '<section><h2 class="h2">Propositions envoyées</h2><div class="tr-list">' + T.sent.map((t) => offer(t,
      '<button class="btn" type="button" data-tcancel="' + t.id + '">Annuler</button>', 'Proposé à <b>' + esc(t.with.name) + '</b>, en attente de sa réponse')).join('') + '</div></section>' : '')
    + (!T.received.length && !T.sent.length ? '<p class="empty">Aucune proposition en cours. Pour échanger des cartes, ouvre l\'onglet Amis et touche « Échanger » à côté d\'un ami.</p>' : '')
    + (T.closed.length ? '<section><h2 class="h2">Derniers échanges</h2><div class="tr-list">' + T.closed.map((t) => offer(t, '',
      '<b class="st-' + t.status + '">' + STATUS[t.status] + '</b> avec ' + esc(t.with.name))).join('') + '</div></section>' : '');
}

/* ---------- classement ---------- */
function boardHTML() {
  const B = G.S.social.board, F = G.S.social.friends;
  if (!B) return spinner;
  const known = new Set(F ? F.friends.map((f) => f.id).concat(F.asked.map((f) => f.id), F.requests.map((f) => f.id)) : []);
  /* les trois premiers sur un podium, puis tout le classement */
  const podium = B.top.length >= 3 ? '<div class="podium">' + B.top.slice(0, 3).map((p, i) => '<div class="pod pod-' + (i + 1) + (p.id === B.me ? ' me' : '') + '"><em>' + (i + 1) + '</em><i class="soc-av"><span>' + initial(p.name) + '</span></i><b>' + esc(p.name) + '</b>'
    + '<span>' + plural(p.cardsUnique, 'carte', 'cartes') + ' · ' + plural(p.wins, 'victoire', 'victoires') + '</span></div>').join('') + '</div>' : '';
  /* (sur un téléphone, les chiffres passent sous le pseudo : le tableau tient dans l'écran) */
  return podium + '<table class="board"><thead><tr><th>#</th><th>Joueur</th><th class="num hide-s">Cartes</th><th class="num hide-s">Victoires</th><th class="num hide-s">Défis</th><th class="num hide-s">Mondiaux</th><th></th></tr></thead><tbody>'
    + B.top.map((p, i) => '<tr' + (p.id === B.me ? ' class="me"' : '') + '><td>' + (i + 1) + '</td><td><b>' + esc(p.name) + '</b><small class="show-s">' + plural(p.cardsUnique, 'carte', 'cartes') + ' · ' + plural(p.wins, 'victoire', 'victoires')
      + (p.duelWins ? ' · ' + plural(p.duelWins, 'défi gagné', 'défis gagnés') : '') + (p.titles ? ' · ' + p.titles + ' ★' : '') + '</small></td>'
      + '<td class="num hide-s">' + p.cardsUnique + ' / ' + B.totalCards + '</td><td class="num hide-s">' + p.wins + '</td><td class="num hide-s">' + (p.duelWins || 0) + '</td><td class="num hide-s">' + (p.titles || 0) + '</td>'
      + '<td class="num">' + (p.id === B.me || known.has(p.id) ? '' : '<button class="btn slim" type="button" data-ask="' + esc(p.name) + '" title="Demander en ami">+ Ami</button>') + '</td></tr>').join('')
    + '</tbody></table>';
}

/* ---------- actions ---------- */
function bind(main) {
  const form = $('#addFriend', main);
  if (form) {
    const box = $('#suggest', form), input = form.name;
    let typing = 0;
    const ask = async (name) => {
      if (!NAME_RULE.test(name)) { G.toast('Pseudo invalide : 3 à 16 caractères, lettres, chiffres, tiret ou tiret bas.', true); return; }
      const res = await G.guard(() => G.call('POST', '/api/friends/ask', { name }));
      if (!res) return;
      G.toast(res.accepted ? res.friend.name + ' et toi êtes maintenant amis.' : 'Demande envoyée à ' + res.friend.name + '.');
      reload();
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value.trim()); });
    /* quelques pseudos qui commencent par ce qui est tapé */
    input.addEventListener('input', () => {
      clearTimeout(typing);
      const q = input.value.trim();
      if (q.length < 2) { box.hidden = true; return; }
      typing = setTimeout(async () => {
        let data = null;
        try { data = await G.call('GET', '/api/players?q=' + encodeURIComponent(q)); } catch (e) { data = null; }
        if (!data || input.value.trim() !== q || !data.players.length) { box.hidden = true; return; }
        box.innerHTML = data.players.map((p) => '<button type="button" data-pick="' + esc(p.name) + '">' + esc(p.name) + '</button>').join('');
        box.hidden = false;
      }, 260);
    });
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) { input.value = b.dataset.pick; box.hidden = true; ask(b.dataset.pick); } });
  }
  /* (la boîte est refaite à chaque dessin : l'écoute ne s'empile pas) */
  $('#soc', main).addEventListener('click', onClick);
}
async function onClick(e) {
  const b = e.target.closest('button');
  if (!b || !G) return;
  const d = b.dataset;
  if (d.open) { openFriend(Number(d.open), d.focus); return; }
  if (d.trade) { openTrade(Number(d.trade), d.name); return; }
  if (d.answer) {
    b.disabled = true;
    const res = await G.guard(() => G.call('POST', '/api/friends/answer', { id: Number(d.answer), accept: !!d.yes }));
    if (res && d.yes) G.toast('Vous êtes maintenant amis.');
    reload();
  } else if (d.remove) {
    b.disabled = true;
    await G.guard(() => G.call('POST', '/api/friends/remove', { id: Number(d.remove) }));
    reload();
  } else if (d.ask) {
    b.disabled = true;
    const res = await G.guard(() => G.call('POST', '/api/friends/ask', { name: d.ask }));
    if (res) G.toast(res.accepted ? res.friend.name + ' et toi êtes maintenant amis.' : 'Demande envoyée à ' + res.friend.name + '.');
    const friends = await G.guard(() => G.call('GET', '/api/friends'));
    if (friends) G.S.social.friends = friends;
    if (onTab()) draw($('#main'));
    G.pulse();
  } else if (d.tanswer) {
    b.disabled = true;
    const res = await G.guard(() => G.call('POST', '/api/trades/answer', { id: Number(d.tanswer), accept: !!d.yes }));
    if (res && res.done) {
      for (const [id, qty] of res.cards) G.owned(id, qty);
      G.toast(res.received.length ? plural(res.received.length, 'carte reçue', 'cartes reçues') + ' : elles sont dans ta collection.' : 'Échange conclu.');
      G.refreshMe();
    }
    reload();
  } else if (d.tcancel) {
    b.disabled = true;
    await G.guard(() => G.call('POST', '/api/trades/cancel', { id: Number(d.tcancel) }));
    reload();
  }
}

/* ---------- la fiche d'un ami ---------- */
async function openFriend(id, focus) {
  const S = G.S, cat = S.cat;
  const data = await G.guard(() => G.call('GET', '/api/player?id=' + id));
  if (!data) return;
  const p = data.player, now = G.now();
  const slots = ['top', 'jgl', 'mid', 'bot', 'sup', 'coach'];
  const team = slots.map((k, i) => {
    const card = data.deck[k] ? cat.cardById.get(data.deck[k]) : null;
    return card ? cardHTML(card, cat) : '<div class="sq-empty"><i>·</i><b>' + ['Top', 'Jungle', 'Mid', 'ADC', 'Support', 'Coach'][i] + '</b><em>remplaçant</em></div>';
  }).join('');
  let format = 1, fearless = true;
  try { format = Number(localStorage.getItem('bcorps-cartes-format')) || 1; fearless = localStorage.getItem('bcorps-cartes-fearless') !== '0'; } catch (e) { format = 1; }
  /* (le fearless n'est proposé que si le serveur le connaît) */
  const canFearless = !!S.shop;
  const s = openSheet(sheetTitle(esc(p.name), (p.online ? '<i class="dot on"></i>En ligne' : 'Vu ' + since(now - p.seenAt)) + ' · joueur depuis le ' + frDate(p.createdAt))
    + '<div class="tally soc-tally"><div><b>' + data.lineup.rating + '</b><span>Note d\'équipe</span></div><div><b>' + p.duelWins + ' – ' + p.duelLosses + '</b><span>Défis</span></div>'
    + '<div><b>' + p.cards + '</b><span>Cartes</span></div><div class="gold"><b>' + p.titles + '</b><span>' + (p.titles > 1 ? 'Mondiaux' : 'Mondial') + '</span></div></div>'
    /* son club : son blason, son niveau, son rang au classé, ses infrastructures */
    + (p.club ? '<div class="soc-club">' + crestHTML(p.team, p.club.short, 'small') + '<span><b>' + esc(p.team) + '</b><i>Club de niveau ' + p.club.level + (p.rank ? ' · ' + esc(p.rank.label) : '') + '</i></span>'
      + '<span class="soc-club-s">' + structuresLine(p.club.levels) + '</span></div>' : '')
    + '<div class="foe-cards">' + team + '</div>'
    + '<div class="soc-duel" id="duelBox"><h3>Le défier</h3><div class="pills" id="fmt">' + FORMATS.map((f) => '<button type="button" data-format="' + f[0] + '"' + (f[0] === format ? ' class="on"' : '') + '>' + f[1] + '</button>').join('') + '</div>'
    + (canFearless ? '<label class="soc-fear" id="fearBox"' + (format > 1 ? '' : ' hidden') + '><input type="checkbox" id="fear"' + (fearless ? ' checked' : '') + '><span><b>Fearless</b> : un champion joué dans une manche ne peut plus l\'être dans les suivantes, par aucune des deux équipes.</span></label>' : '')
    + '<div class="actions"><button class="btn primary" type="button" id="goLive"' + (p.online ? '' : ' disabled') + '>Défier en direct</button><button class="btn" type="button" id="goBot">Affronter son équipe</button></div>'
    + '<p class="note">' + (p.online ? 'En direct : vous faites la draft chacun votre tour, ' + (data.turn || 35) + ' secondes par choix, puis vous regardez la même partie.'
      : esc(p.name) + ' n\'est pas en ligne : le défi en direct attendra.') + ' « Affronter son équipe » : l\'ordinateur dirige ses cartes, il n\'a pas besoin d\'être là.</p></div>'
    + '<div class="actions"><button class="btn" type="button" id="goTrade">Proposer un échange</button><button class="btn danger" type="button" id="unfriend">Retirer de mes amis</button></div>',
    { cls: 'friend', label: p.name });
  const box = s.box;
  $('#fmt', box).addEventListener('click', (e) => {
    const b = e.target.closest('[data-format]');
    if (!b) return;
    format = Number(b.dataset.format);
    try { localStorage.setItem('bcorps-cartes-format', String(format)); } catch (err) { /* réglage non gardé */ }
    box.querySelectorAll('[data-format]').forEach((x) => x.classList.toggle('on', x === b));
    if ($('#fearBox', box)) $('#fearBox', box).hidden = format < 2;
  });
  if ($('#fear', box)) $('#fear', box).addEventListener('change', (e) => {
    fearless = e.target.checked;
    try { localStorage.setItem('bcorps-cartes-fearless', fearless ? '1' : '0'); } catch (err) { /* réglage non gardé */ }
  });
  const fear = () => canFearless && fearless && format > 1;
  $('#goLive', box).addEventListener('click', () => { s.close(); G.duel.invite({ id: p.id, name: p.name }, format, fear()); });
  $('#goBot', box).addEventListener('click', () => { s.close(); G.duel.bot({ id: p.id, name: p.name }, format, fear()); });
  $('#goTrade', box).addEventListener('click', () => { s.close(); openTrade(p.id, p.name, data.cards); });
  $('#unfriend', box).addEventListener('click', async () => {
    if (!(await confirmSheet('Retirer ' + p.name + ' ?', 'Vous ne pourrez plus vous défier ni échanger de cartes. Les propositions d\'échange en attente entre vous seront annulées.', 'Retirer', { danger: true }))) return;
    s.close();
    await G.guard(() => G.call('POST', '/api/friends/remove', { id: p.id }));
    reload();
  });
  if (focus === 'duel') $('#duelBox', box).scrollIntoView({ block: 'center' });
}

/* ---------- préparer un échange ---------- */
async function openTrade(friendId, name, theirCards) {
  const S = G.S, cat = S.cat, MAX = (S.social && S.social.trades && S.social.trades.rules.maxCards) || 5;
  if (!theirCards) {
    const data = await G.guard(() => G.call('GET', '/api/player?id=' + friendId));
    if (!data) return;
    theirCards = data.cards;
  }
  const byOvr = (a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  const pools = {
    give: [...S.owned.entries()].map(([id, o]) => [cat.cardById.get(id), o.qty]).filter((x) => x[0]).sort((a, b) => byOvr(a[0], b[0])),
    get: theirCards.map(([id, qty]) => [cat.cardById.get(id), qty]).filter((x) => x[0]).sort((a, b) => byOvr(a[0], b[0])),
  };
  const picked = { give: [], get: [] }, query = { give: '', get: '' };
  /* de préférence ce que l'autre n'a pas : mes doubles d'abord, et chez lui les cartes qui me manquent */
  const theirs = new Set(theirCards.map((c) => c[0]));
  const side = (key, title, hint) => '<div class="tr-side" data-side="' + key + '"><h3>' + title + ' <em data-count="' + key + '">0 / ' + MAX + '</em></h3><div class="tr-picked" data-picked="' + key + '"></div>'
    + '<input class="inp" type="search" data-q="' + key + '" placeholder="' + hint + '" autocomplete="off"><div class="tr-pool" data-pool="' + key + '"></div></div>';
  const s = openSheet(sheetTitle('Échange avec ' + esc(name), 'Jusqu\'à ' + MAX + ' cartes de chaque côté. Rien ne bouge tant que ' + esc(name) + ' n\'a pas accepté.')
    + '<div class="seg tr-tabs" id="trTabs"><button type="button" data-side="give" class="on">Tu donnes</button><button type="button" data-side="get">Tu reçois</button></div>'
    + '<div class="tr-cols" data-show="give">' + side('give', 'Tu donnes', 'Chercher dans tes cartes…') + side('get', 'Tu reçois', 'Chercher dans ses cartes…') + '</div>'
    + '<div class="actions tr-send"><button class="btn primary big" type="button" id="trSend" disabled>Proposer l\'échange</button><p class="note" id="trNote"></p></div>',
    { cls: 'trade', label: 'Échange avec ' + name });
  const box = s.box;
  const drawPool = (key) => {
    const q = query[key].trim().toLowerCase();
    const list = pools[key].filter(([c]) => !q || c.name.toLowerCase().includes(q) || (cat.teamById.get(c.team) || { name: '' }).name.toLowerCase().includes(q) || c.team.toLowerCase() === q);
    /* ce qui a le plus de chances d'intéresser : mes doubles, ses cartes que je n'ai pas */
    const want = (x) => (key === 'give' ? (x[1] > 1 ? 2 : 0) + (theirs.has(x[0].id) ? 0 : 1) : S.owned.has(x[0].id) ? 0 : 1);
    list.sort((a, b) => want(b) - want(a) || byOvr(a[0], b[0]));
    const shown = list.slice(0, 48);
    $('[data-pool="' + key + '"]', box).innerHTML = shown.map(([c, qty]) => '<button class="tr-card' + (picked[key].includes(c.id) ? ' on' : '') + '" type="button" data-add="' + key + '" data-id="' + esc(c.id) + '" aria-label="' + esc(c.name) + '">'
      + cardHTML(c, cat, { qty }) + '</button>').join('')
      + (list.length > shown.length ? '<p class="tr-more">' + (list.length - shown.length) + ' autres cartes : affine ta recherche.</p>' : '')
      + (!list.length ? '<p class="tr-more">' + (pools[key].length ? 'Aucune carte ne correspond.' : key === 'give' ? 'Tu n\'as pas encore de cartes.' : esc(name) + ' n\'a pas encore de cartes.') + '</p>' : '');
  };
  const drawPicked = () => {
    for (const key of ['give', 'get']) {
      $('[data-picked="' + key + '"]', box).innerHTML = picked[key].length ? picked[key].map((id) => '<button class="tr-card on" type="button" data-add="' + key + '" data-id="' + esc(id) + '" title="Retirer">' + cardHTML(cat.cardById.get(id), cat) + '</button>').join('')
        : '<p class="tr-none">' + (key === 'give' ? 'Touche une de tes cartes ci-dessous.' : 'Touche une de ses cartes ci-dessous.') + '</p>';
      $('[data-count="' + key + '"]', box).textContent = picked[key].length + ' / ' + MAX;
    }
    const n = picked.give.length + picked.get.length;
    $('#trSend', box).disabled = !n;
    $('#trNote', box).textContent = !n ? '' : !picked.get.length ? 'Un cadeau : tu ne demandes rien en retour.' : !picked.give.length ? 'Tu ne donnes rien en retour : à lui de voir.' : '';
    box.querySelectorAll('#trTabs button').forEach((b) => { b.textContent = (b.dataset.side === 'give' ? 'Tu donnes' : 'Tu reçois') + ' (' + picked[b.dataset.side].length + ')'; });
  };
  drawPool('give'); drawPool('get'); drawPicked();
  box.addEventListener('click', async (e) => {
    const tab = e.target.closest('#trTabs [data-side]');
    if (tab) { $('.tr-cols', box).dataset.show = tab.dataset.side; box.querySelectorAll('#trTabs button').forEach((b) => b.classList.toggle('on', b === tab)); return; }
    const add = e.target.closest('[data-add]');
    if (add) {
      const key = add.dataset.add, id = add.dataset.id, at = picked[key].indexOf(id);
      if (at >= 0) picked[key].splice(at, 1);
      else if (picked[key].length >= MAX) { G.toast(MAX + ' cartes au plus de chaque côté.', true); return; }
      else picked[key].push(id);
      drawPool(key); drawPicked();
      return;
    }
    if (e.target.closest('#trSend')) {
      const btn = $('#trSend', box);
      btn.disabled = true;
      try {
        await G.call('POST', '/api/trades/offer', { to: friendId, give: picked.give, want: picked.get });
        s.close();
        G.toast('Proposition envoyée à ' + name + '.');
        G.S.social.tab = 'echanges';
        if (onTab()) reload(); else location.hash = '#/joueurs';
      } catch (err) {
        btn.disabled = false;
        G.toast(err instanceof ApiError ? err.message : 'Un problème est survenu.', true);
      }
    }
  });
  box.addEventListener('input', (e) => { const q = e.target.closest('[data-q]'); if (q) { query[q.dataset.q] = q.value; drawPool(q.dataset.q); } });
}
export { openFriend, openTrade };
