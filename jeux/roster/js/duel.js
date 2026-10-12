/* Les défis entre joueurs : invitation, série en une, trois ou cinq manches, draft en direct.
   Le serveur tient la série et fait avancer la draft ; ce module enchaîne les écrans (attente, draft, partie, manche suivante)
   et vient aux nouvelles toutes les deux secondes quand c'est à l'adversaire de jouer. */
import { ApiError } from './api.js';
import { esc } from './cards.js';
import { runDraft } from './draft.js';
import { runMatch } from './match.js';
import { sfx } from './sound.js';
import { confirmSheet, countdown, num, openSheet, sheetTitle } from './ui.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const formatName = (n, fearless) => (n === 1 ? 'une partie' : 'BO' + n + (fearless ? ' fearless' : ''));
const POLL = 2000;

/** ctx : ce que l'application prête — S, call, guard, toast, now, refresh, refreshMe, expired. Renvoie { invite, bot, incoming, resume }. */
export function createDuels(ctx) {
  const { S, call, guard, toast } = ctx;
  /* invitations déjà montrées au joueur pendant cette visite */
  const shown = new Set();
  let asking = null;

  /* ce que la draft attend du serveur : le match, la partie si elle vient d'être jouée ; over : le défi s'est arrêté (l'adversaire a quitté) */
  const forfeited = (d) => !!(d && d.status !== 'live' && d.result && d.result.forfeit);
  const shape = (d) => Object.assign({ match: d.match, deadline: d.deadline, away: d.away, forfeitAt: d.forfeitAt, duel: d, over: forfeited(d) }, d.last ? { sim: d.last.sim, report: d.last.report } : {});
  const headOf = (d) => {
    const sv = d.series;
    return (d.format > 1 ? 'BO' + d.format + (d.fearless ? ' fearless' : '') + ' · manche ' + sv.game + ' · ' + sv.wins[0] + ' – ' + sv.wins[1] : 'Défi en une partie') + ' · contre ' + d.foe.name;
  };
  /* quitter un défi en direct, c'est l'abandonner : on le fait confirmer */
  const confirmQuit = (d) => confirmSheet('Abandonner le défi ?', 'Si tu quittes maintenant, tu perds par forfait : ' + d.foe.name + ' remporte le défi et sa récompense.', 'Abandonner', { danger: true });
  /** Le défi s'est terminé par un abandon : on l'annonce. */
  function forfeitSheet(d) {
    const r = d.result;
    return new Promise((resolve) => {
      const s = openSheet(sheetTitle(r.won ? 'Victoire par forfait' : 'Défaite par forfait', (d.format > 1 ? 'BO' + d.format + ' · ' + d.series.wins[0] + ' – ' + d.series.wins[1] + ' · ' : '') + 'contre ' + esc(d.foe.name))
        + '<p class="lead">' + (r.won ? esc(d.foe.name) + ' a quitté le défi : la victoire te revient.' : 'Tu as quitté le défi : la victoire revient à ' + esc(d.foe.name) + '.') + '</p>'
        + (r.won ? '<div class="prize"><span>Récompense du défi</span><b>+' + num(r.coins) + ' crédits</b>' + (r.reduced ? '<i>Plus de trois défis aujourd\'hui contre ce joueur : gain réduit.</i>' : '') + '</div>' : '')
        + '<div class="actions"><button class="btn primary big" type="button" data-ok>Continuer</button></div>', { cls: 'small duel-wait', label: 'Défi terminé', onClose: resolve });
      s.box.querySelector('[data-ok]').addEventListener('click', () => s.close());
      if (r.won) sfx.turn();
    });
  }

  /** Défie un ami en direct : il a trois minutes pour accepter. */
  async function invite(friend, format, fearless) {
    if (S.busy) return;
    const res = await guard(() => call('POST', '/api/duel/invite', { to: friend.id, format, fearless: !!fearless }));
    if (!res) return;
    let d = res.duel, over = false;
    const s = openSheet(sheetTitle('Défi lancé', esc(friend.name) + ' · ' + formatName(format, fearless))
      + '<p class="lead">En attente de sa réponse… <b class="num" id="duelLeft"></b></p><div class="spin"></div>'
      + '<div class="actions"><button class="btn" type="button" data-cancel>Annuler le défi</button></div>', { cls: 'small duel-wait', label: 'Défi lancé', keep: true, onClose: () => { over = true; } });
    s.box.querySelector('[data-cancel]').addEventListener('click', async () => {
      s.close();
      try { await call('POST', '/api/duel/leave', { id: d.id }); } catch (e) { /* l'invitation expirera toute seule */ }
    });
    const left = s.box.querySelector('#duelLeft');
    while (!over) {
      left.textContent = countdown(d.until - ctx.now());
      await wait(POLL);
      if (over) return;
      try { d = (await call('GET', '/api/duel?id=' + d.id)).duel; } catch (e) { if (e instanceof ApiError && e.status === 401) { s.close(); ctx.expired(); return; } continue; }
      if (d.status === 'live') { s.close(); runSeries(d); return; }
      if (d.status !== 'invite') { s.close(); toast(d.status === 'no' ? friend.name + ' a décliné le défi.' : friend.name + ' n\'a pas répondu à temps.', true); return; }
    }
  }

  /** Affronte l'équipe d'un ami, dirigée par l'ordinateur. */
  async function bot(friend, format, fearless) {
    if (S.busy) return;
    const res = await guard(() => call('POST', '/api/duel/bot', { to: friend.id, format, fearless: !!fearless }));
    if (res) runSeries(res.duel);
  }

  /** Une invitation vient d'arriver : on la propose au joueur (une seule fois, et jamais au milieu d'une partie). */
  function incoming(invites) {
    if (S.busy || asking) return;
    const inv = invites.find((i) => !shown.has(i.id) && i.until > ctx.now() + 4000);
    if (!inv) return;
    shown.add(inv.id);
    let done = false;
    const s = openSheet(sheetTitle(esc(inv.from.name) + ' te défie', formatName(inv.format, inv.fearless).replace(/^une/, 'En une'))
      + '<p class="lead">Draft en direct, chacun son tour, puis vous regardez la même partie. <b class="num" id="invLeft"></b></p>'
      + '<div class="actions"><button class="btn primary big" type="button" data-yes>Accepter</button><button class="btn big" type="button" data-no>Refuser</button></div>',
      { cls: 'small duel-wait', label: 'Défi reçu', keep: true, onClose: () => { done = true; asking = null; } });
    asking = s;
    sfx.turn();
    const answer = async (accept) => {
      s.close();
      const res = await guard(() => call('POST', '/api/duel/answer', { id: inv.id, accept }));
      if (res && res.duel) runSeries(res.duel);
    };
    s.box.querySelector('[data-yes]').addEventListener('click', () => answer(true));
    s.box.querySelector('[data-no]').addEventListener('click', () => answer(false));
    const left = s.box.querySelector('#invLeft');
    (async () => {
      while (!done) {
        const ms = inv.until - ctx.now();
        if (ms <= 0) { s.close(); return; }
        left.textContent = countdown(ms);
        await wait(500);
      }
    })();
  }

  /** Reprend un défi en cours (après avoir quitté l'écran, ou rechargé la page). */
  async function resume(id) {
    if (S.busy) return;
    const res = await guard(() => call('GET', '/api/duel?id=' + id + '&have=99'));
    if (res && res.duel && res.duel.status === 'live') runSeries(res.duel);
    else if (res && forfeited(res.duel)) { await forfeitSheet(res.duel); await ctx.refreshMe(); ctx.refresh(); }
    else if (res) toast('Ce défi est terminé.');
  }

  /* la récompense affichée après une manche : le point sur la série, ou le résultat final */
  function rewardsFor(d, wonGame) {
    const sv = d.series, label = d.format > 1 ? 'BO' + d.format : 'Défi';
    if (sv.phase === 'done') {
      const r = d.result || { won: sv.wins[0] > sv.wins[1], coins: 0 };
      return {
        won: r.won, title: r.won ? 'Victoire' : 'Défaite', sub: label + ' ' + (r.won ? 'remporté' : 'perdu') + ' ' + sv.wins[0] + ' – ' + sv.wins[1],
        html: '<div class="prize"><span>' + (r.won ? 'Récompense du défi' : 'Lot de consolation') + '</span><b>+' + num(r.coins) + ' crédits</b>'
          + (r.reduced ? '<i>Plus de trois défis aujourd\'hui contre ce joueur : gain réduit.</i>' : d.bot ? '<i>Équipe dirigée par l\'ordinateur : moitié moins qu\'en direct.</i>' : '') + '</div>',
      };
    }
    return {
      won: wonGame, title: wonGame ? 'Manche gagnée' : 'Manche perdue', sub: label + ' · ' + sv.wins[0] + ' – ' + sv.wins[1], next: 'Manche suivante',
      html: '<div class="prize"><span>' + label + ' contre ' + esc(d.foe.name) + '</span><b>' + sv.wins[0] + ' – ' + sv.wins[1] + '</b><i>La série continue : premier à ' + (d.format + 1) / 2 + ' manches.</i></div>',
    };
  }

  /** Déroule une série jusqu'au bout : draft, partie, manche suivante… */
  async function runSeries(first) {
    if (S.busy) return;
    S.busy = true;
    let d = first, have = d.series ? d.series.games.length : 0, quit = false;
    const fetchDuel = async () => { d = (await call('GET', '/api/duel?id=' + d.id + '&have=' + have)).duel; return d; };
    /* j'abandonne : le serveur donne la victoire à l'adversaire (ou à moi, s'il était parti le premier) */
    const giveUp = async () => {
      quit = true;
      try { await call('POST', '/api/duel/leave', { id: d.id }); if (!d.bot) await fetchDuel(); } catch (e) { /* le défi se fermera de lui-même */ }
    };
    try {
      for (let guardLoop = 0; guardLoop < 12 && d && d.series; guardLoop++) {
        if (d.series.phase === 'draft' && d.status === 'live') {
          const out = await runDraft({
            match: d.match, cat: S.cat, fx: S.fx, toast, help: false, head: headOf(d),
            act: async (body) => { d = (await call('POST', '/api/duel/act', { id: d.id, champ: body.champ, role: body.role, step: body.step, auto: body.auto })).duel; return shape(d); },
            resync: async () => (await fetchDuel()).match,
            live: d.bot ? null : { poll: async () => shape(await fetchDuel()), deadline: d.deadline, now: ctx.now, foe: d.foe.name },
            confirmLeave: d.bot ? null : () => confirmQuit(d),
          });
          if (out.left) { await giveUp(); break; }
          /* l'adversaire a quitté pendant la draft */
          if (out.over) { d = out.over.duel; break; }
          d = out.final.duel;
        }
        /* une manche vient d'être jouée : on la regarde */
        const played = d.last;
        if (played && d.series.games.length > have) {
          have = d.series.games.length;
          const game = d.series.games[played.game], wonGame = !!(game && game.won);
          /* pendant qu'on regarde la partie, le jeu continue de donner signe de vie pour ce défi */
          let gone = null;
          const id = d.id, keep = d.bot || d.status !== 'live' ? 0 : setInterval(() => {
            call('GET', '/api/duel?id=' + id + '&have=99').then((r) => {
              /* l'adversaire a quitté pendant qu'on regardait la partie : on prévient tout de suite */
              if (!gone && forfeited(r.duel)) { gone = r.duel; toast(r.duel.result.won ? r.duel.foe.name + ' a quitté le défi : victoire par forfait.' : 'Défi perdu par forfait.'); }
            }).catch(() => {});
          }, 25000);
          await runMatch({ data: { match: played.match || d.match, report: played.report, sim: played.sim, rewards: rewardsFor(d, wonGame) }, cat: S.cat, fx: S.fx });
          clearInterval(keep);
          if (gone) { d = gone; break; }
        }
        if (d.status !== 'live' || d.series.phase === 'done') break;
        if (d.series.phase === 'between') {
          d = (await call('POST', '/api/duel/ready', { id: d.id })).duel;
          /* l'adversaire regarde encore la partie : on l'attend (le serveur lance la suite au bout de quelques minutes au plus) */
          if (d.status === 'live' && d.series.phase === 'between') {
            let gone = false;
            const s = openSheet(sheetTitle('Manche suivante', esc(d.foe.name) + ' · ' + d.series.wins[0] + ' – ' + d.series.wins[1])
              + '<p class="lead" id="waitLine">En attente de ' + esc(d.foe.name) + '…</p><div class="spin"></div><div class="actions"><button class="btn" type="button" data-quit>Abandonner le défi</button></div>',
              { cls: 'small duel-wait', label: 'Manche suivante', keep: true });
            s.box.querySelector('[data-quit]').addEventListener('click', async () => { if (d.bot || await confirmQuit(d)) { gone = true; s.close(); } });
            const line = s.box.querySelector('#waitLine');
            while (!gone && d.status === 'live' && d.series.phase === 'between') {
              /* s'il ne donne plus signe de vie : le temps qu'il lui reste avant de perdre par forfait */
              line.textContent = d.away && d.forfeitAt ? d.foe.name + ' ne répond plus. Victoire par forfait dans ' + countdown(d.forfeitAt - ctx.now()) + ' s\'il ne revient pas.' : 'En attente de ' + d.foe.name + '…';
              await wait(POLL);
              if (!gone) await fetchDuel();
            }
            s.close();
            if (gone) { await giveUp(); break; }
          }
        }
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { S.busy = false; ctx.expired(); return; }
      toast(e instanceof ApiError ? e.message : 'Un problème est survenu.', true);
      if (!(e instanceof ApiError)) console.error(e);
    }
    S.busy = false;
    /* le défi s'est fini par un abandon (le mien, ou celui de l'adversaire) : on le dit */
    if (d && !d.bot && forfeited(d)) { try { await forfeitSheet(d); } catch (e) { /* rien */ } }
    else if (quit && d && d.bot) toast('Série abandonnée.');
    await ctx.refreshMe();
    ctx.refresh();
  }

  return { invite, bot, incoming, resume };
}
