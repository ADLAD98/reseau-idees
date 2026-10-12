/* L'onglet « Marché » : acheter les cartes que les autres joueurs mettent en vente, vendre les siennes contre des crédits.
   Le serveur tient les annonces, vérifie les prix et fait passer cartes et crédits d'un joueur à l'autre ; ici on affiche. */
import { ApiError } from './api.js';
import { VARIANTS, cardHTML, esc } from './cards.js';
import { ROLE_NAME, ROLE_ORDER } from './config.js';
import { confirmSheet, num, openSheet, plural, sheetTitle, since } from './ui.js';

const $ = (sel, root) => (root || document).querySelector(sel);
let G = null;
const onTab = () => /^#\/?marche/.test(location.hash) && !!document.getElementById('main');
const coin = () => G.icon('i-coin');
const nameOf = (card) => card.name + (card.variant ? ' (' + VARIANTS[card.variant].name.toLowerCase() + ')' : '');
/* prix proposé par défaut, quand personne ne vend encore cette carte : selon le rang, plus cher pour une version spéciale */
const BASE_PRICE = [0, 30, 80, 250, 900, 3000], VARIANT_PRICE = { holo: 2.5, full: 5, kc: 6 };
const advised = (card) => Math.round(BASE_PRICE[card.tier] * (card.variant ? VARIANT_PRICE[card.variant] : 1));

export async function viewMarket(main, ctx) {
  G = ctx;
  const S = G.S;
  if (!S.market) S.market = { tab: 'acheter', filters: { q: '', league: '', team: '', role: '', tier: '', variant: '', sort: 'recent', card: '' }, page: 0, data: null, mine: null, open: false };
  draw(main);
  await load();
  if (onTab()) draw($('#main'));
}
async function load() {
  const m = G.S.market;
  if (m.tab === 'ventes') {
    const data = await G.guard(() => G.call('GET', '/api/market/mine'));
    if (data) { m.mine = data; G.pulse(); }
    return;
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(m.filters)) if (v) params.set(k, v);
  if (m.page) params.set('page', m.page);
  const data = await G.guard(() => G.call('GET', '/api/market?' + params.toString()));
  if (data) m.data = data;
}
const reload = async () => { await load(); if (onTab()) draw($('#main')); };

function draw(main) {
  const S = G.S, m = S.market, sales = S.pulse ? S.pulse.inbox.sales : 0;
  const rules = (m.data && m.data.rules) || (m.mine && m.mine.rules) || { fee: 0.05 };
  main.innerHTML = '<div id="mk"><div class="col-head"><div><h1 class="h1">Marché</h1><p>Achète et vends des cartes entre joueurs. Une commission de ' + Math.round(rules.fee * 100) + ' % est retenue sur chaque vente.</p></div>'
    + '<div class="tally"><div class="gold"><b>' + num(S.player.coins) + '</b><span>crédits</span></div></div></div>'
    + '<div class="mk-bar"><div class="seg" id="mkTabs"><button type="button" data-mt="acheter"' + (m.tab === 'acheter' ? ' class="on"' : '') + '>Acheter</button>'
    + '<button type="button" data-mt="ventes"' + (m.tab === 'ventes' ? ' class="on"' : '') + '>Mes ventes' + (sales ? '<em>' + sales + '</em>' : '') + '</button></div>'
    + '<button class="btn primary" type="button" id="mkSell"' + (S.owned.size ? '' : ' disabled') + '>Vendre une carte</button></div>'
    + '<div id="mkBody">' + (m.tab === 'acheter' ? buyHTML() : mineHTML()) + '</div></div>';
  const root = $('#mk', main);
  $('#mkTabs', root).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-mt]');
    if (!b || b.dataset.mt === m.tab) return;
    m.tab = b.dataset.mt;
    draw(main);
    await load();
    if (onTab()) draw($('#main'));
  });
  $('#mkSell', root).addEventListener('click', () => pickCard());
  root.addEventListener('click', onClick);
  if (m.tab === 'acheter') bindFilters(root);
}
const spinner = '<div class="center" style="min-height:26dvh"><div class="spin"></div></div>';

/* ---------- acheter ---------- */
function buyHTML() {
  const S = G.S, m = S.market, f = m.filters, cat = S.cat, D = m.data;
  const option = (value, text, current) => '<option value="' + esc(value) + '"' + (String(current) === String(value) ? ' selected' : '') + '>' + esc(text) + '</option>';
  const teams = cat.teams.filter((t) => !f.league || t.league === f.league);
  const only = f.card ? cat.cardById.get(f.card) : null;
  let html = '<div class="filters mk-filters"><input class="inp" id="mq" type="search" placeholder="Nom d\'un joueur…" value="' + esc(f.q) + '" autocomplete="off">'
    + '<button class="btn filters-toggle' + (m.open ? ' on' : '') + '" type="button" id="mmore" aria-expanded="' + !!m.open + '">Filtres</button>'
    + '<div class="filters-more' + (m.open ? ' open' : '') + '" id="mbox">'
    + '<select class="sel" data-mf="league" aria-label="Ligue">' + option('', 'Toutes les ligues', f.league) + cat.leagues.map((l) => option(l.id, l.name, f.league)).join('') + '</select>'
    + '<select class="sel" data-mf="team" aria-label="Équipe">' + option('', 'Toutes les équipes', f.team) + teams.map((t) => option(t.id, t.name, f.team)).join('') + '</select>'
    + '<select class="sel" data-mf="role" aria-label="Poste">' + option('', 'Tous les postes', f.role) + ROLE_ORDER.map((r) => option(r, ROLE_NAME[r], f.role)).join('') + '</select>'
    + '<select class="sel" data-mf="tier" aria-label="Rang">' + option('', 'Tous les rangs', f.tier) + [...cat.tiers].reverse().map((t) => option(t.id, t.name, f.tier)).join('') + '</select>'
    + '<select class="sel" data-mf="variant" aria-label="Version">' + option('', 'Toutes les versions', f.variant) + option('base', 'Ordinaires', f.variant) + Object.entries(VARIANTS).map(([id, v]) => option(id, v.name, f.variant)).join('') + '</select>'
    + '<select class="sel" data-mf="sort" aria-label="Tri">' + [['recent', 'Tri : récentes'], ['cheap', 'Tri : moins chères'], ['dear', 'Tri : plus chères'], ['ovr', 'Tri : note']].map((s) => option(s[0], s[1], f.sort)).join('') + '</select>'
    + '</div></div>';
  if (only) html += '<p class="mk-only">Annonces pour <b>' + esc(only.name) + '</b>, toutes versions <button class="btn slim" type="button" data-clear>Tout le marché</button></p>';
  if (!D) return html + spinner;
  html += '<p class="count mk-count">' + (D.total ? plural(D.total, 'carte en vente', 'cartes en vente') : 'Aucune carte en vente') + (D.total !== D.open ? ' pour ces filtres (' + D.open + ' en tout)' : '') + '</p>';
  if (!D.listings.length) {
    return html + '<p class="empty">' + (D.open ? 'Aucune annonce ne correspond à ces filtres.' : 'Le marché est vide pour l\'instant. Sois le premier à vendre : touche « Vendre une carte ».') + '</p>';
  }
  html += '<div class="mk-grid">' + D.listings.map((l) => {
    const card = cat.cardById.get(l.card);
    if (!card) return '';
    const own = S.owned.get(l.card), short = !l.mine && l.price > S.player.coins;
    return '<div class="mk-item' + (l.mine ? ' mine' : '') + '"><button class="tile" type="button" data-card="' + esc(l.card) + '" aria-label="' + esc(card.name) + '">' + cardHTML(card, cat)
      + (own ? '<span class="badge qty">' + (own.qty > 1 ? '×' + own.qty : 'déjà') + '</span>' : '<span class="badge new">manquante</span>') + '</button>'
      + '<div class="mk-info"><b class="mk-price">' + coin() + num(l.price) + '</b><span>' + (l.mine ? 'ton annonce' : 'par ' + esc(l.seller.name)) + ' · ' + since(G.now() - l.at) + '</span></div>'
      + (l.mine ? '<button class="btn slim" type="button" data-unlist="' + l.id + '">Retirer</button>'
        : '<button class="btn primary slim" type="button" data-buy="' + l.id + '"' + (short ? ' disabled title="Il te manque ' + num(l.price - S.player.coins) + ' crédits"' : '') + '>' + (short ? 'Trop cher' : 'Acheter') + '</button>') + '</div>';
  }).join('') + '</div>';
  if (D.pages > 1) html += '<div class="mk-pages"><button class="btn slim" type="button" data-page="' + (D.page - 1) + '"' + (D.page ? '' : ' disabled') + '>‹ Précédent</button><span>page ' + (D.page + 1) + ' / ' + D.pages + '</span>'
    + '<button class="btn slim" type="button" data-page="' + (D.page + 1) + '"' + (D.page + 1 < D.pages ? '' : ' disabled') + '>Suivant ›</button></div>';
  return html;
}
function bindFilters(root) {
  const m = G.S.market, f = m.filters;
  let typing = 0;
  const q = $('#mq', root);
  if (!q) return;
  q.addEventListener('input', () => { f.q = q.value; m.page = 0; clearTimeout(typing); typing = setTimeout(async () => { await load(); if (onTab() && $('#mq') && $('#mq').value === f.q) { const body = $('#mkBody'); const at = q.selectionStart; body.innerHTML = buyHTML(); bindFilters($('#mk')); const again = $('#mq'); again.focus(); again.setSelectionRange(at, at); } }, 320); });
  $('#mmore', root).addEventListener('click', (e) => {
    m.open = !m.open;
    e.currentTarget.classList.toggle('on', m.open);
    e.currentTarget.setAttribute('aria-expanded', String(m.open));
    $('#mbox', root).classList.toggle('open', m.open);
  });
  root.querySelectorAll('[data-mf]').forEach((sel) => sel.addEventListener('change', () => {
    f[sel.dataset.mf] = sel.value;
    if (sel.dataset.mf === 'league') f.team = '';
    m.page = 0;
    reload();
  }));
}

/* ---------- mes ventes ---------- */
function mineHTML() {
  const S = G.S, M = S.market.mine, cat = S.cat;
  if (!M) return spinner;
  const item = (l) => {
    const card = cat.cardById.get(l.card);
    return card ? '<div class="mk-item mine"><button class="tile" type="button" data-card="' + esc(l.card) + '" aria-label="' + esc(card.name) + '">' + cardHTML(card, cat) + '</button>'
      + '<div class="mk-info"><b class="mk-price">' + coin() + num(l.price) + '</b><span>en vente ' + since(G.now() - l.at) + '</span></div>'
      + '<button class="btn slim" type="button" data-unlist="' + l.id + '">Retirer</button></div>' : '';
  };
  const sold = (s) => {
    const card = cat.cardById.get(s.card);
    return '<div class="hist-row win' + (s.fresh ? ' fresh' : '') + '"><b>Vendue</b><span class="hist-foe">' + esc(card ? nameOf(card) : s.card) + ' · à ' + esc(s.buyer) + '</span>'
      + '<span class="hist-score">' + num(s.price) + ' − ' + num(s.fee) + ' de commission · ' + since(G.now() - s.at) + '</span><span class="hist-coins">+' + num(s.price - s.fee) + '</span><span></span></div>';
  };
  return '<section><h2 class="h2">En vente · ' + M.open.length + ' / ' + M.rules.maxOpen + '</h2>'
    + (M.open.length ? '<div class="mk-grid">' + M.open.map(item).join('') + '</div>' : '<p class="empty">Tu n\'as aucune carte en vente. Tes doubles peuvent intéresser d\'autres joueurs : touche « Vendre une carte ».</p>') + '</section>'
    + (M.sold.length ? '<section><h2 class="h2">Mes dernières ventes</h2><div class="hist">' + M.sold.map(sold).join('') + '</div></section>' : '');
}

/* ---------- actions ---------- */
async function onClick(e) {
  const b = e.target.closest('button');
  if (!b || !G) return;
  const d = b.dataset, S = G.S, m = S.market;
  if (d.buy) {
    const l = m.data && m.data.listings.find((x) => x.id === Number(d.buy));
    const card = l && S.cat.cardById.get(l.card);
    if (!l || !card) return;
    if (!(await confirmSheet('Acheter ' + card.name + ' ?', esc(nameOf(card)) + ', vendue par ' + esc(l.seller.name) + ' pour <b>' + num(l.price) + ' crédits</b>. Il t\'en restera ' + num(S.player.coins - l.price) + '.', 'Acheter'))) return;
    b.disabled = true;
    const res = await G.guard(() => G.call('POST', '/api/market/buy', { id: l.id }));
    if (res) {
      G.applyState(res);
      G.owned(res.card.id, res.card.qty);
      G.toast(card.name + ' rejoint ta collection.');
    }
    reload();
  } else if (d.unlist) {
    b.disabled = true;
    const res = await G.guard(() => G.call('POST', '/api/market/unlist', { id: Number(d.unlist) }));
    if (res) {
      G.applyState(res);
      if (res.card) G.owned(res.card.id, res.card.qty);
      G.toast('Annonce retirée : la carte est revenue dans ta collection.');
    }
    reload();
  } else if (d.page !== undefined) {
    m.page = Math.max(0, Number(d.page));
    await reload();
    window.scrollTo(0, 0);
  } else if (d.clear !== undefined) {
    m.filters.card = '';
    m.page = 0;
    reload();
  }
}

/* ---------- vendre ---------- */
/** Choisir la carte à vendre parmi les siennes : les doubles d'abord. */
function pickCard() {
  const S = G.S, cat = S.cat;
  const mine = [...S.owned.entries()].map(([id, o]) => [cat.cardById.get(id), o.qty]).filter((x) => x[0])
    .sort((a, b) => (b[1] > 1) - (a[1] > 1) || b[0].ovr - a[0].ovr || a[0].name.localeCompare(b[0].name));
  let q = '';
  const list = () => {
    const shown = mine.filter(([c]) => !q || c.name.toLowerCase().includes(q) || (cat.teamById.get(c.team) || { name: '' }).name.toLowerCase().includes(q)).slice(0, 60);
    return shown.length ? shown.map(([c, qty]) => '<button class="pick" type="button" data-sell="' + esc(c.id) + '">' + cardHTML(c, cat) + (qty > 1 ? '<span class="badge qty">×' + qty + '</span>' : '')
      + '<span class="pick-note">' + (qty > 1 ? plural(qty - 1, 'double', 'doubles') : '&nbsp;') + '</span></button>').join('') : '<p class="empty">Aucune carte ne correspond.</p>';
  };
  const s = openSheet(sheetTitle('Vendre une carte', 'Tes doubles d\'abord. Une carte en vente quitte ta collection ; elle y revient si tu retires l\'annonce.')
    + '<input class="inp" type="search" id="sellQ" placeholder="Chercher dans tes cartes…" autocomplete="off"><div class="pick-grid" id="sellGrid">' + list() + '</div>', { cls: 'picker', label: 'Vendre une carte' });
  $('#sellQ', s.box).addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); $('#sellGrid', s.box).innerHTML = list(); });
  s.box.addEventListener('click', (e) => { const b = e.target.closest('[data-sell]'); if (b) { s.close(); sellCard(b.dataset.sell); } });
}

/** Fixer le prix d'une carte et la mettre en vente. */
export async function sellCard(id, ctx) {
  if (ctx) G = ctx;
  const S = G.S, cat = S.cat, card = cat.cardById.get(id), own = S.owned.get(id);
  if (!card || !own) return;
  const info = await G.guard(() => G.call('GET', '/api/market/price?card=' + encodeURIComponent(id)));
  if (!info) return;
  const rules = (S.market && ((S.market.data && S.market.data.rules) || (S.market.mine && S.market.mine.rules))) || { minPrice: 10, maxPrice: 1000000, fee: 0.05 };
  const start = info.lowest ? Math.max(rules.minPrice, info.lowest - 1) : info.last.length ? info.last[0] : advised(card);
  const feeOf = (p) => Math.max(1, Math.round(p * rules.fee));
  const s = openSheet(sheetTitle('Vendre ' + esc(card.name), esc(nameOf(card)) + ' · ' + (own.qty > 1 ? 'tu en as ' + own.qty + ' exemplaires' : 'ton seul exemplaire'))
    + '<div class="mk-sell"><div class="mk-sell-card">' + cardHTML(card, cat, { eager: true }) + '</div><form class="mk-sell-form" id="sellForm" novalidate>'
    + '<div class="kv"><span>La moins chère en vente</span><b>' + (info.lowest ? num(info.lowest) + ' crédits' + (info.open > 1 ? ' (' + info.open + ' annonces)' : '') : 'aucune annonce') + '</b>'
    + '<span>Dernières ventes</span><b>' + (info.last.length ? info.last.map(num).join(' · ') : 'aucune') + '</b></div>'
    + '<label class="field">Ton prix, en crédits<input class="inp" name="price" type="number" inputmode="numeric" min="' + rules.minPrice + '" max="' + rules.maxPrice + '" step="1" value="' + start + '" required></label>'
    + '<p class="hint" id="sellNet"></p><p class="form-error" role="alert"></p>'
    + '<div class="actions"><button class="btn primary big" type="submit">Mettre en vente</button></div>'
    + (own.qty === 1 ? '<p class="note">C\'est ton dernier exemplaire : il quittera ta collection (et ne peut pas être vendu s\'il joue dans ton équipe).</p>' : '') + '</form></div>',
    { cls: 'sell', label: 'Vendre ' + card.name });
  const form = $('#sellForm', s.box), net = $('#sellNet', s.box), error = $('.form-error', form);
  const show = () => {
    const p = Math.floor(Number(form.price.value));
    net.textContent = p >= rules.minPrice && p <= rules.maxPrice ? 'Commission : ' + num(feeOf(p)) + '. Tu recevras ' + num(p - feeOf(p)) + ' crédits à la vente.' : 'Entre ' + num(rules.minPrice) + ' et ' + num(rules.maxPrice) + ' crédits.';
  };
  show();
  form.price.addEventListener('input', show);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const price = Math.floor(Number(form.price.value));
    if (!(price >= rules.minPrice && price <= rules.maxPrice)) { error.textContent = 'Prix invalide.'; return; }
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    error.textContent = '';
    try {
      const res = await G.call('POST', '/api/market/sell', { card: id, price });
      G.applyState(res);
      G.owned(res.card.id, res.card.qty);
      s.close();
      G.toast(card.name + ' est en vente pour ' + num(price) + ' crédits.');
      if (!S.market) S.market = { tab: 'ventes', filters: { q: '', league: '', team: '', role: '', tier: '', variant: '', sort: 'recent', card: '' }, page: 0, data: null, mine: null, open: false };
      S.market.tab = 'ventes';
      if (onTab()) reload(); else location.hash = '#/marche';
    } catch (err) {
      btn.disabled = false;
      error.textContent = err instanceof ApiError ? err.message : 'Un problème est survenu.';
    }
  });
}
/** Ouvre le marché sur les annonces d'une carte précise (toutes ses versions). */
export function showOnMarket(baseId, ctx) {
  if (ctx) G = ctx;
  const S = G.S;
  if (!S.market) S.market = { tab: 'acheter', filters: { q: '', league: '', team: '', role: '', tier: '', variant: '', sort: 'cheap', card: '' }, page: 0, data: null, mine: null, open: false };
  Object.assign(S.market.filters, { q: '', league: '', team: '', role: '', tier: '', variant: '', sort: 'cheap', card: baseId });
  S.market.tab = 'acheter';
  S.market.page = 0;
  if (onTab()) reload(); else location.hash = '#/marche';
}
