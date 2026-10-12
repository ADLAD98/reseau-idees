/* La draft : bans et picks contre l'équipe adverse, dans l'ordre des compétitions.
   Le joueur choisit, le serveur vérifie et fait jouer l'adversaire ; cet écran met en scène.
   Les conseils affichés (méta, confort, duel) suivent les règles du serveur : voir rules.js. */
import { ApiError } from './api.js';
import { esc, iconUrl, photoUrl } from './cards.js';
import { ROLE_LABEL, STORE } from './config.js';
import { CLASS_NAME, DAMAGE_NAME, ORDER, PHASES, ROLES, compState, pickValue, played, signed } from './rules.js';
import { setSound, sfx, soundOn } from './sound.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const icon = (id) => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + id + '"/></svg>';
const half = (x) => String(x).replace('.', ',');
const games = (n) => n + (n > 1 ? ' parties' : ' partie');

const HELP = '<div class="dr-help-box panel"><h3>Gagner la draft</h3><ul>'
  + '<li><b>Méta</b> — les champions les plus disputés chez les pros cette saison valent davantage.</li>'
  + '<li><b>Confort</b> — un joueur est bien meilleur sur les champions qu\'il a vraiment joués cette saison : l\'étoile indique son nombre de parties. Hors de son répertoire, il perd des points.</li>'
  + '<li><b>Duel</b> — sur chaque voie, les classes se contrent : Assassin › Mage › Combattant › Tank › Assassin. Entre supports : Tank › Mage › Enchanteur › Tank. Choisir après l\'adversaire permet de le contrer (flèche verte) ; choisir avant t\'expose.</li>'
  + '<li><b>Composition</b> — mêle dégâts physiques et magiques, et prends au moins un tank : une équipe déséquilibrée perd des points.</li>'
  + '<li><b>Bans</b> — retire les champions fétiches des joueurs adverses : la grille les classe du plus dangereux au moins dangereux.</li>'
  + '</ul><p>Le total de chaque joueur s\'ajoute à sa force pendant la partie.</p>'
  + '<div class="actions"><button class="btn" type="button" data-act="help">Compris</button></div></div>';

/** Joue la draft d'un match. act(body) envoie un choix au serveur ; resync() redemande l'état du match ;
    help : ouvrir d'office l'explication des règles (première draft du joueur) ; head : une ligne au-dessus du titre (série en cours).
    confirmLeave() : demande confirmation avant de quitter (un défi en direct : quitter, c'est l'abandonner) ;
    live : draft en direct contre un autre joueur — { poll() : vient aux nouvelles auprès du serveur, deadline : échéance du choix en cours,
    now() : heure du serveur }. L'adversaire ne répond pas dans la foulée : on attend son choix en interrogeant le serveur.
    Renvoie { final } (la réponse du serveur au dernier choix : la partie est jouée), { left: true } si le joueur quitte l'écran,
    ou { over } (la réponse du serveur) si le défi s'est arrêté pendant la draft : l'adversaire a quitté.
    Fearless : le serveur donne dans match.locked les champions déjà joués dans la série ; ils restent affichés, barrés.
    Draft automatique : si le joueur l'allume, son coach choisit à sa place (le serveur décide, selon le talent du coach : match.coach).
    Elle est éteinte au début de chaque draft : c'est au joueur de l'allumer, à chaque fois.
    Draft simulée (contre l'ordinateur seulement) : le coach fait tous les choix du joueur d'un trait, sans pause ni son, et l'on passe à la partie.
    On la demande d'emblée (instant) ou en cours de draft, par le bouton « Simuler ». */
export function runDraft({ match, cat, fx, act, resync, toast, help, head, live, confirmLeave, instant }) {
  let m = match;
  /* en direct : échéance du choix en cours, adversaire absent (son coach choisit alors pour lui ; forfeitAt : l'heure de son forfait) */
  let deadline = live ? live.deadline : null, away = false, forfeitAt = null, alive = true, asking = false, pollTimer = 0, clockTimer = 0;
  /* la draft automatique n'existe que si le serveur sait la jouer (il annonce alors le talent du coach) */
  const canAuto = typeof m.coach === 'number';
  let auto = false, autoTimer = 0, fast = false;
  /* (le jeu retenait ce réglage d'une draft à l'autre : il ne le fait plus, et oublie ce qu'il avait noté) */
  try { localStorage.removeItem(STORE + 'draft-auto'); } catch (e) { /* rien à oublier */ }
  const coachWord = (s) => (s >= 92 ? 'coach d\'élite' : s >= 86 ? 'très bon coach' : s >= 79 ? 'bon coach' : s >= 70 ? 'coach moyen' : s >= 62 ? 'coach faible' : 'pas de vrai coach');
  const you = m.you, foe = 1 - you;
  const champs = Object.entries(cat.champions).filter(([, c]) => c.r.length).sort((a, b) => a[1].n.localeCompare(b[1].n, 'fr'));
  const champ = (id) => cat.champions[id];
  const cardOf = (side, i) => { const p = m.teams[side].players[i]; return (p.id && cat.cardById.get(p.id)) || null; };
  const nameOf = (side, i) => m.teams[side].players[i].name || 'Remplaçant';

  /* ce qui est affiché : la draft rejouée jusqu'à l'action n° « shown » */
  let shown = 0;
  const bans = [[], []], picks = [[null, null, null, null, null], [null, null, null, null, null]];
  let sel = null;        // champion désigné, pas encore verrouillé
  let role = '';         // poste concerné : celui qu'on choisit (pick), ou le filtre de la grille (ban ; vide = tous)
  let lastType = '';
  let query = '';
  let busy = true, settle = null, fail = null;

  const teamHTML = (side) => {
    const t = m.teams[side];
    return '<section class="dr-team s' + side + (side === you ? ' me' : '') + '" data-side="' + side + '">'
      + '<div class="dr-tname"><b>' + esc(t.short) + '</b><span>' + t.rating + '</span><i>' + (side === you ? 'Toi · ' : '') + (side === 0 ? 'côté bleu' : 'côté rouge') + '</i></div>'
      + '<div class="dr-bans">' + [0, 1, 2, 3, 4].map((k) => '<span class="dr-ban" data-k="' + k + '" data-champ=""></span>').join('') + '</div>'
      + '<div class="dr-slots">' + ROLES.map((r, i) => {
        const card = cardOf(side, i), p = t.players[i];
        return '<button class="dr-slot" type="button" data-side="' + side + '" data-role="' + r + '" data-champ="" disabled>'
          + '<span class="dr-pic"><em>' + ROLE_LABEL[r] + '</em></span>'
          + '<span class="dr-who"><b>' + esc(card ? card.name : 'Remplaçant') + '</b><i>' + ROLE_LABEL[r] + ' · ' + p.ovr + (p.bonus ? ' <u>+' + p.bonus + '</u>' : '') + '</i><span class="dr-cname"></span></span>'
          + (card && card.photo ? '<img class="dr-face" src="' + photoUrl(card, 96) + '" alt="" loading="lazy" decoding="async" draggable="false">' : '<span class="dr-face"></span>') + '</button>';
      }).join('') + '</div></section>';
  };
  const el = document.createElement('div');
  el.className = 'dr';
  el.dataset.you = you;
  el.innerHTML = '<header class="dr-head"><button class="op-icon" type="button" data-act="leave" aria-label="Quitter la draft">' + icon('i-close') + '</button>'
    + (head ? '<span class="dr-series">' + esc(head) + '</span>' : '')
    + '<div class="dr-phase"><span class="dr-step"></span><span class="dr-titlerow"><b class="dr-title" aria-live="polite"></b><span class="dr-timer" hidden></span></span></div>'
    + '<button class="op-icon" type="button" data-act="help" aria-label="Comment gagner la draft">?</button>'
    + '<button class="op-icon" type="button" data-act="sound" aria-label="Couper ou remettre le son"></button></header>'
    + '<div class="dr-track" aria-hidden="true">' + ORDER.map((o, k) => '<i class="s' + o.side + ' ' + o.type + (PHASES.some((p) => p[0] === k && k) ? ' gap' : '') + '"></i>').join('') + '</div>'
    + '<div class="dr-body">' + teamHTML(0)
    + '<section class="dr-pool"><div class="dr-tools"><div class="dr-roles"></div><input class="inp dr-q" type="search" placeholder="Chercher…" autocomplete="off" aria-label="Chercher un champion"></div>'
    + '<p class="dr-hint"></p>'
    + '<div class="dr-grid">' + champs.map(([id, c]) => '<button class="dr-c" type="button" data-champ="' + id + '" title="' + esc(c.n) + '"><span class="dr-ci"><img src="' + iconUrl(cat, id) + '" alt="" loading="lazy" decoding="async" draggable="false"></span>'
      + '<span class="dr-cn">' + esc(c.n) + '</span><i class="dr-star"></i><i class="dr-arrow"></i></button>').join('') + '</div></section>'
    + teamHTML(1) + '</div>'
    + '<p class="dr-away" hidden></p>'
    + '<footer class="dr-foot"><div class="dr-sel"></div>'
    + (canAuto ? '<button class="btn dr-auto" type="button" data-act="auto" aria-pressed="false" title="Ton coach choisit à ta place. Meilleur est le coach (sa note et sa statistique Draft), meilleurs sont ses choix.">'
      + '<b><span class="hide-s">Draft </span>auto</b><i><span class="hide-s">' + esc(coachWord(m.coach)) + ' · </span>' + m.coach + '</i></button>' : '')
    /* contre l'ordinateur : laisser le coach finir la draft d'un trait */
    + (canAuto && !live ? '<button class="btn dr-sim" type="button" data-act="sim" title="Ton coach termine la draft d\'un trait, sans attendre : on passe à la partie."><b>Simuler</b><i class="hide-s">la draft</i></button>' : '')
    + '<button class="btn primary big" type="button" data-act="lock" disabled>Verrouiller</button></footer>'
    + '<p class="dr-fast" hidden>Ton coach termine la draft…</p>'
    + '<div class="dr-help"' + (help ? '' : ' hidden') + '>' + HELP + '</div>';

  const $ = (s) => el.querySelector(s);
  const tiles = new Map(Array.from(el.querySelectorAll('.dr-c'), (b) => [b.dataset.champ, { b, star: b.querySelector('.dr-star'), arrow: b.querySelector('.dr-arrow') }]));
  const slotEl = (side, i) => el.querySelector('.dr-slot[data-side="' + side + '"][data-role="' + ROLES[i] + '"]');
  const banEl = (side, k) => el.querySelector('.dr-team[data-side="' + side + '"] .dr-ban[data-k="' + k + '"]');
  const turn = () => ORDER[shown] || null;
  /* c'est à moi de jouer : mon tour, et tout ce que le serveur a envoyé est déjà affiché */
  const myTurn = () => { const t = turn(); return !!t && t.side === you && shown === m.log.length && !busy; };
  const taken = () => new Set([...bans[0], ...bans[1], ...picks[0].filter(Boolean), ...picks[1].filter(Boolean)]);
  /* fearless : les champions déjà joués dans les manches précédentes de la série */
  const lockedSet = () => new Set(m.locked || []);
  const soundBtn = $('[data-act="sound"]');
  const drawSound = () => { soundBtn.innerHTML = icon(soundOn() ? 'i-sound' : 'i-mute'); soundBtn.classList.toggle('off', !soundOn()); };
  drawSound();

  function apply(a) {
    if (a.type === 'ban') bans[a.side].push(a.champ);
    else picks[a.side][ROLES.indexOf(a.role)] = a.champ;
  }
  /** Reconstruit l'affichage jusqu'à l'action n° « to », sans animation. */
  function rebuild(to) {
    bans[0].length = 0; bans[1].length = 0;
    picks[0].fill(null); picks[1].fill(null);
    for (let k = 0; k < to; k++) apply(m.log[k]);
    shown = to;
  }

  /* ---------- valeur d'un champion ---------- */
  /* pour mon joueur du poste r */
  const mine = (id, r) => { const i = ROLES.indexOf(r); return pickValue(champ(id), id, cardOf(you, i), r, picks[foe][i] ? champ(picks[foe][i]) : null); };
  /* danger : ce que ce champion vaudrait au mieux pour l'adversaire, sur ses postes encore libres (ou sur le seul poste « only ») */
  function threat(id, only) {
    let best = null;
    ROLES.forEach((r, i) => {
      if (picks[foe][i] || !champ(id).r.includes(r) || (only && r !== only)) return;
      const v = pickValue(champ(id), id, cardOf(foe, i), r, picks[you][i] ? champ(picks[you][i]) : null);
      if (!best || v.total > best.total) best = Object.assign(v, { i });
    });
    return best;
  }

  /* ---------- affichage ---------- */
  function syncHead() {
    const t = turn(), phase = PHASES.find((p) => shown >= p[0] && shown < p[1]);
    $('.dr-step').textContent = phase ? phase[2] : 'Draft terminée';
    $('.dr-title').textContent = !t ? 'Que la partie commence' : t.side === you ? (t.type === 'ban' ? 'À toi de bannir' : 'À toi de choisir') : m.teams[foe].short + (t.type === 'ban' ? ' bannit…' : ' choisit…');
    el.dataset.turn = !t ? 'over' : t.side === you ? 'me' : 'foe';
    /* phase de bans : toute l'interface passe au rouge */
    el.dataset.mode = !t ? 'over' : t.type;
    el.querySelectorAll('.dr-track i').forEach((tick, k) => { tick.classList.toggle('done', k < shown); tick.classList.toggle('now', k === shown); });
  }
  function syncTeams() {
    const t = turn(), my = myTurn();
    for (const side of [0, 1]) {
      el.querySelector('.dr-team[data-side="' + side + '"]').classList.toggle('turn', !!t && t.side === side);
      for (let k = 0; k < 5; k++) {
        const b = banEl(side, k), next = !!t && t.type === 'ban' && t.side === side && k === bans[side].length;
        const preview = next && side === you && my && sel ? sel : '';
        const id = bans[side][k] || preview;
        if (b.dataset.champ !== id) { b.dataset.champ = id; b.innerHTML = id ? '<img src="' + iconUrl(cat, id) + '" alt="' + esc(champ(id).n) + '" title="' + esc(champ(id).n) + '" draggable="false">' : ''; }
        b.classList.toggle('now', next);
        b.classList.toggle('preview', !!preview);
      }
      for (let i = 0; i < 5; i++) {
        const s = slotEl(side, i), locked = picks[side][i] || '';
        const open = side === you && my && t.type === 'pick' && !locked;
        const preview = open && ROLES[i] === role && sel ? sel : '';
        const id = locked || preview;
        if (s.dataset.champ !== id) {
          s.dataset.champ = id;
          s.querySelector('.dr-pic').innerHTML = id ? '<img src="' + iconUrl(cat, id) + '" alt="" draggable="false">' : '<em>' + ROLE_LABEL[ROLES[i]] + '</em>';
          s.querySelector('.dr-cname').textContent = id ? champ(id).n : '';
        }
        s.classList.toggle('picked', !!locked);
        s.classList.toggle('preview', !!preview);
        s.classList.toggle('now', open && ROLES[i] === role);
        s.disabled = !open;
      }
    }
  }
  function syncRoles() {
    const t = turn(), my = myTurn(), box = $('.dr-roles');
    const picking = !!t && t.type === 'pick' && t.side === you;
    let html = picking ? '' : '<button type="button" data-r=""' + (role === '' ? ' class="on"' : '') + '>Tous</button>';
    ROLES.forEach((r, i) => {
      /* pick : mes postes encore libres, avec le champion d'en face s'il est connu ; ban : les joueurs adverses à viser */
      const done = picking ? !!picks[you][i] : !!picks[foe][i];
      const facing = picking && picks[foe][i] ? '<img src="' + iconUrl(cat, picks[foe][i]) + '" alt="face à ' + esc(champ(picks[foe][i]).n) + '">' : '';
      html += '<button type="button" data-r="' + r + '"' + (done ? ' disabled' : '') + (r === role ? ' class="on"' : '') + '><b>' + ROLE_LABEL[r] + '</b><small>' + esc(nameOf(picking ? you : foe, i)) + '</small>' + facing + '</button>';
    });
    box.innerHTML = html;
    box.classList.toggle('idle', !my);
    $('.dr-hint').textContent = !t ? '' : picking
      ? 'Du meilleur choix au moins bon pour ' + (role ? nameOf(you, ROLES.indexOf(role)) : 'ton joueur') + '. ★ : ses parties de la saison sur ce champion.'
      : 'Du plus dangereux au moins dangereux entre les mains de l\'adversaire. ★ : parties jouées par le joueur visé.';
  }
  function syncPool() {
    const t = turn(), my = myTurn(), used = taken(), gone = lockedSet(), q = query.trim().toLowerCase();
    const picking = !!t && t.type === 'pick' && t.side === you;
    const ranked = [];
    for (const [id, c] of champs) {
      const tile = tiles.get(id);
      let visible = picking ? c.r.includes(role) : !role || c.r.includes(role);
      let score = -9, star = '', arrow = '';
      if (visible && picking) {
        const v = mine(id, role), g = played(cardOf(you, ROLES.indexOf(role)), id);
        score = v.total; star = g ? String(g[0]) : ''; arrow = v.counter > 0 ? 'up' : v.counter < 0 ? 'down' : '';
      } else if (visible) {
        const v = threat(id, role || null);
        if (v) { const g = played(cardOf(foe, v.i), id); score = v.total; star = g ? String(g[0]) : ''; }
      }
      if (q && !c.n.toLowerCase().includes(q)) visible = false;
      tile.b.hidden = !visible;
      tile.b.disabled = used.has(id) || gone.has(id);
      tile.b.classList.toggle('on', id === sel);
      tile.b.classList.toggle('gone', gone.has(id));
      if (gone.has(id)) tile.b.title = c.n + ' — déjà joué dans cette série (fearless)';
      tile.star.textContent = star;
      tile.arrow.className = 'dr-arrow' + (arrow ? ' ' + arrow : '');
      if (visible) ranked.push([tile.b, gone.has(id) ? -199 : used.has(id) ? -99 : score]);
    }
    /* la grille est triée sans recréer ses images : on change seulement l'ordre d'affichage */
    ranked.sort((a, b) => b[1] - a[1]);
    ranked.forEach(([b], k) => { b.style.order = k; });
    $('.dr-grid').classList.toggle('idle', !my || auto);
  }
  function compHTML() {
    const list = picks[you].filter(Boolean).map(champ);
    if (!list.length) return '';
    const s = compState(list);
    return '<p class="dr-comp">Ta composition : <b>' + half(s.ad) + '</b> physique · <b>' + half(s.ap) + '</b> magique · ligne de front <b class="' + (s.front ? 'ok' : 'ko') + '">' + (s.front ? 'oui' : 'pas encore') + '</b></p>';
  }
  function syncFoot() {
    const t = turn(), my = myTurn(), box = $('.dr-sel'), btn = $('[data-act="lock"]');
    if (!t) { box.innerHTML = '<p class="dr-tip">La draft est terminée.</p>'; btn.hidden = true; return; }
    btn.textContent = t.type === 'ban' ? 'Bannir' : 'Verrouiller';
    btn.disabled = !my || !sel || auto;
    const autoBtn = $('[data-act="auto"]');
    if (autoBtn) { autoBtn.classList.toggle('on', auto); autoBtn.setAttribute('aria-pressed', auto ? 'true' : 'false'); }
    if (!sel || !my || auto) {
      box.innerHTML = '<p class="dr-tip">' + (t.side !== you ? esc(m.teams[foe].name) + (away ? ' est absent : son coach choisit à sa place…' : ' réfléchit…') : busy ? 'Un instant…'
        : auto ? 'Draft auto : ton coach choisit…'
          : t.type === 'ban' ? 'Désigne un champion à interdire aux deux équipes.' : 'Désigne un poste, puis le champion de ton joueur.') + '</p>' + compHTML();
      return;
    }
    const c = champ(sel), chip = (label, v, note, cls) => '<span class="dr-chip ' + (v > 0.05 ? 'up' : v < -0.05 ? 'down' : '') + (cls || '') + '">' + label + ' <b>' + signed(v) + '</b>' + (note ? '<i>' + esc(note) + '</i>' : '') + '</span>';
    let chips = '', sub = '', total = '';
    if (t.type === 'pick') {
      const i = ROLES.indexOf(role), v = mine(sel, role), g = played(cardOf(you, i), sel), facing = picks[foe][i];
      chips = chip('Méta', v.meta) + chip('Confort', v.comfort, g ? games(g[0]) : 'jamais joué') + (facing ? chip('Duel', v.counter, 'face à ' + champ(facing).n) : '');
      total = '<em class="dr-total">' + signed(v.total) + '</em>';
      sub = 'pour ' + nameOf(you, i) + ' · ' + CLASS_NAME[c.t] + ' · ' + DAMAGE_NAME[c.d];
    } else {
      const v = threat(sel, null), g = v ? played(cardOf(foe, v.i), sel) : null;
      chips = v ? chip('Danger', v.total, nameOf(foe, v.i) + (g ? ' · ' + games(g[0]) : ''), ' wide') : '<span class="dr-chip">Peu de danger : l\'adversaire n\'a plus de poste pour lui</span>';
      sub = CLASS_NAME[c.t] + ' · ' + DAMAGE_NAME[c.d] + (c.g ? ' · joué ' + c.g + ' fois et banni ' + c.b + ' fois par les pros cette saison' : '');
    }
    box.innerHTML = '<span class="dr-sel-i-box"><img class="dr-sel-i" src="' + iconUrl(cat, sel) + '" alt="" draggable="false"></span><div class="dr-sel-t"><b>' + esc(c.n) + total + '</b><span>' + esc(sub) + '</span><div class="dr-chips">' + chips + '</div></div>';
  }
  function syncAll() { syncHead(); syncTeams(); syncRoles(); syncPool(); syncFoot(); }
  const pop = (node) => { if (!node) return; node.classList.remove('pop'); void node.offsetWidth; node.classList.add('pop'); };

  /* ---------- déroulement ---------- */
  /** Montre une à une les actions que le serveur a enregistrées et qui ne sont pas encore à l'écran. */
  async function playLog() {
    while (shown < m.log.length) {
      const a = m.log[shown], theirs = a.side !== you;
      /* contre l'ordinateur, un temps de réflexion feint ; en direct, l'adversaire a déjà pris le sien */
      if (theirs && fx && !fast && !live) { syncAll(); await wait(620 + Math.random() * 480); }
      apply(a);
      shown++;
      /* en draft automatique, les choix s'enchaînent : un simple « toc » à la place des coups */
      if (fast) { /* draft simulée : en silence */ } else if (auto) sfx.tick(); else if (a.type === 'ban') sfx.ban(); else sfx.pick();
      syncAll();
      pop(a.type === 'ban' ? banEl(a.side, bans[a.side].length - 1) : slotEl(a.side, ROLES.indexOf(a.role)));
      if (fast) await wait(40); else if (fx) await wait(theirs ? 400 : 280);
    }
  }
  /** Prépare le tour du joueur. */
  function startTurn() {
    const t = turn();
    busy = false;
    sel = null;
    if (t && t.side === you) {
      if (t.type !== lastType || (t.type === 'pick' && (!role || picks[you][ROLES.indexOf(role)]))) role = t.type === 'pick' ? ROLES.find((r, i) => !picks[you][i]) : '';
      lastType = t.type;
      if (fx && !auto && !fast) sfx.turn();
    }
    syncAll();
    $('.dr-grid').scrollTop = 0;
    armAuto();
  }
  /** Draft simulée : le coach fait tous mes choix d'un trait (les mêmes choix que la draft automatique, sans les pauses). */
  function simulate() {
    if (!canAuto || live || fast) return;
    auto = true; fast = true; sel = null;
    el.classList.add('fast');
    $('.dr-fast').hidden = false;
    syncAll();
    armAuto();
  }
  /** Draft automatique : à mon tour, le coach choisit après un court instant (le temps de voir ce qui se passe). */
  function armAuto() {
    clearTimeout(autoTimer);
    if (!auto || !alive || !myTurn()) return;
    autoTimer = setTimeout(() => { if (auto && alive && myTurn()) lock(true); }, fast ? 30 : fx ? 950 : 250);
  }
  async function lock(byCoach) {
    const t = turn();
    if ((!sel && !byCoach) || !t || !myTurn()) return;
    busy = true;
    /* step : le nombre de choix déjà faits que cet écran connaît (un choix fait trop tard est refusé par le serveur) */
    const body = byCoach ? { id: m.id, auto: true, step: m.log.length } : { id: m.id, champ: sel, step: m.log.length };
    if (!byCoach && t.type === 'pick') body.role = role;
    syncFoot();
    let res;
    try {
      res = await act(body);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { close(); fail(e); return; }
      toast(e instanceof ApiError ? e.message : 'Un problème est survenu.', true);
      if (!(e instanceof ApiError)) console.error(e);
      /* le serveur n'est pas d'accord : on repart de ce qu'il a en mémoire (sans réseau, on reste où l'on est) */
      if (e instanceof ApiError && e.status) {
        let fresh = null;
        try { fresh = await resync(); } catch (e2) { fresh = m; }
        if (!fresh || fresh.id !== m.id) { close(); settle({ left: true }); return; }
        m = fresh;
        rebuild(m.log.length);
      }
      startTurn();
      return;
    }
    query = '';
    $('.dr-q').value = '';
    await absorb(res);
  }
  /** Prend en compte une réponse du serveur : nouveaux choix à montrer, échéance, et la partie si la draft est finie. */
  async function absorb(res) {
    /* le défi s'est arrêté là : l'adversaire a quitté */
    if (res.over) { close(); settle({ over: res }); return; }
    busy = true;
    m = res.match;
    sel = null;
    if (res.deadline !== undefined) deadline = res.deadline;
    if (res.away !== undefined) { away = !!res.away; forfeitAt = res.forfeitAt || null; }
    await playLog();
    if (!alive) return;
    if (res.sim) {
      syncAll();
      if (fx) await wait(fast ? 650 : 1200);
      close();
      settle({ final: res });
      return;
    }
    startTurn();
  }
  /* ---------- en direct : on vient aux nouvelles tant que la draft dure ---------- */
  async function ask() {
    if (!alive || asking || busy) return;
    asking = true;
    try {
      const res = await live.poll();
      if (!alive || busy) return;
      if (res.over) { close(); settle({ over: res }); return; }
      if (res.deadline !== undefined) deadline = res.deadline;
      const wasAway = away;
      away = !!res.away;
      forfeitAt = res.forfeitAt || null;
      /* l'adversaire a choisi (ou l'ordinateur a choisi pour l'un de nous, le temps écoulé) */
      if (res.match && (res.sim || res.match.log.length > m.log.length)) await absorb(res);
      else if (wasAway !== away) syncFoot();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { close(); fail(e); }
      /* une coupure passagère : on réessaiera au prochain tour */
    } finally {
      asking = false;
    }
  }
  function drawClock() {
    /* l'adversaire ne donne plus signe de vie : on prévient, avec le temps qu'il lui reste avant de perdre par forfait */
    const warn = $('.dr-away');
    if (away && forfeitAt) {
      const left = Math.max(0, Math.ceil((forfeitAt - live.now()) / 1000));
      const text = m.teams[foe].name + ' ne répond plus. Victoire par forfait dans ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + ' s\'il ne revient pas.';
      if (warn.textContent !== text) warn.textContent = text;
      warn.hidden = false;
    } else warn.hidden = true;
    const box = $('.dr-timer'), t = turn();
    if (!deadline || !t) { box.hidden = true; return; }
    const left = deadline - live.now();
    box.hidden = false;
    box.classList.toggle('low', left < 10000);
    box.classList.toggle('mine', t.side === you);
    const text = String(Math.max(0, Math.ceil(left / 1000)));
    if (box.textContent !== text) box.textContent = text;
  }

  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a) {
      const what = a.dataset.act;
      if (what === 'sound') { setSound(!soundOn()); drawSound(); sfx.click(); }
      else if (what === 'help') { $('.dr-help').hidden = !$('.dr-help').hidden; }
      else if (what === 'leave') {
        if (confirmLeave) { confirmLeave().then((yes) => { if (yes && alive) { close(); settle({ left: true }); } }); return; }
        close(); settle({ left: true });
      }
      else if (what === 'auto') {
        auto = !auto;
        sel = null;
        sfx.click();
        syncAll();
        armAuto();
      }
      else if (what === 'sim') simulate();
      else if (what === 'lock') lock();
      return;
    }
    if (e.target.classList.contains('dr-help')) { $('.dr-help').hidden = true; return; }
    if (!myTurn()) return;
    const t = turn();
    const r = e.target.closest('[data-r]'), c = e.target.closest('.dr-c'), s = e.target.closest('.dr-slot');
    if (r && !r.disabled) role = r.dataset.r;
    else if (s && !s.disabled) role = s.dataset.role;
    else if (c && !c.disabled) { sel = c.dataset.champ === sel ? null : c.dataset.champ; sfx.click(); }
    else return;
    /* en changeant de poste, un champion qui ne s'y joue pas n'est plus désigné */
    if (t.type === 'pick' && sel && !champ(sel).r.includes(role)) sel = null;
    syncAll();
    if (r || s) $('.dr-grid').scrollTop = 0;
  });
  $('.dr-q').addEventListener('input', (e) => { query = e.target.value; syncPool(); });
  function onKey(e) {
    if (e.key === 'Escape' && !$('.dr-help').hidden) { $('.dr-help').hidden = true; return; }
    if (e.key === 'Enter' && sel && myTurn()) { e.preventDefault(); lock(); }
  }
  const scroll = document.body.style.overflow;
  function close() {
    alive = false;
    clearInterval(pollTimer);
    clearInterval(clockTimer);
    clearTimeout(autoTimer);
    document.removeEventListener('keydown', onKey);
    el.remove();
    document.body.style.overflow = scroll;
  }
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(el);

  /* reprise : tout est affiché d'un coup jusqu'à mon dernier choix, puis ce que l'adversaire a joué depuis est rejoué */
  let lastMine = -1;
  m.log.forEach((a, k) => { if (a.side === you) lastMine = k; });
  rebuild(lastMine + 1);
  syncAll();
  if (live) {
    /* toutes les deux secondes quand on attend l'adversaire ; plus rarement pendant son propre tour (au cas où le temps s'écoule) */
    let beat = 0;
    pollTimer = setInterval(() => { beat++; if (!myTurn() || beat % 2 === 0) ask(); }, 2000);
    clockTimer = setInterval(drawClock, 250);
  }
  return new Promise((resolve, reject) => {
    settle = resolve;
    fail = reject;
    /* draft simulée demandée d'emblée : le coach s'y met dès que l'écran est en place */
    if (instant) simulate();
    playLog().then(startTurn);
  });
}
