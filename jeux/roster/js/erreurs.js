/* Les bugs du jeu, remontés au serveur (serveur : erreurs.ts ; Adrien les voit dans son tableau de bord). Script classique chargé avant
   le jeu, pour attraper aussi une erreur au chargement d'un module. Ce qui part : le message, le fichier et la ligne, la pile d'appels,
   la page du jeu et le type de navigateur — ni pseudo, ni connexion. Pas plus de cinq par visite, chacune une seule fois ; les erreurs
   qui ne viennent pas du jeu (extensions du navigateur, coupures de réseau) ne partent pas. */
(function () {
  var LOCAL = ['localhost', '127.0.0.1'].indexOf(location.hostname) >= 0;
  var API = LOCAL ? 'http://127.0.0.1:8787' : 'https://jeu-cartes.jeu-cartes-serveur.workers.dev';
  var HOME = location.origin + location.pathname.replace(/[^/]*$/, '');
  var sent = {}, count = 0;
  /* « Chrome 141 · Windows » : le type de navigateur, sans plus */
  function browser() {
    var ua = navigator.userAgent, os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'autre';
    var m = /Edg\/(\d+)/.exec(ua) || /OPR\/(\d+)/.exec(ua) || /Firefox\/(\d+)/.exec(ua) || /Chrome\/(\d+)/.exec(ua) || /Version\/(\d+).*Safari/.exec(ua);
    var name = !m ? 'autre' : /^Edg/.test(m[0]) ? 'Edge' : /^OPR/.test(m[0]) ? 'Opera' : /^Firefox/.test(m[0]) ? 'Firefox' : /^Chrome/.test(m[0]) ? 'Chrome' : 'Safari';
    return name + (m ? ' ' + m[1] : '') + ' · ' + os;
  }
  /* les adresses du jeu, raccourcies (« js/app.js ») ; une adresse d'ailleurs : l'erreur n'est pas du jeu */
  var short = function (s) { return String(s || '').split(HOME).join(''); };
  var ours = function (src) { return !src || src.indexOf(HOME) === 0; };
  var NOISE = /^Script error\.?$|ResizeObserver loop|Failed to fetch|NetworkError|Load failed|network error|AbortError|The operation was aborted|Serveur injoignable/i;
  function send(msg, src, line, col, stack) {
    msg = String(msg || '').slice(0, 300);
    if (!msg || NOISE.test(msg) || count >= 5) return;
    var key = msg + '|' + src + '|' + line;
    if (sent[key]) return;
    sent[key] = 1; count++;
    try {
      fetch(API + '/api/errors', {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg: msg, src: short(src).slice(0, 120), line: line || 0, col: col || 0, stack: short(stack).slice(0, 1500), page: (location.hash || '#/').slice(0, 60), browser: browser() }),
      }).catch(function () { /* tant pis */ });
    } catch (e) { /* tant pis */ }
  }
  window.addEventListener('error', function (e) {
    /* (une image ou un fichier qui ne se charge pas : pas une erreur du code) */
    if (!e || !e.message) return;
    if (!ours(e.filename)) return;
    /* « TypeError: x is undefined » (sans le « Uncaught » que certains navigateurs ajoutent) */
    var err = e.error, msg = err && err.message ? (err.name || 'Error') + ': ' + err.message : String(e.message).replace(/^Uncaught /, '');
    send(msg, e.filename, e.lineno, e.colno, err && err.stack);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    /* (un refus du serveur, déjà dit au joueur : pas un bug) */
    if (!r || r.name === 'ApiError' || (r.constructor && r.constructor.name === 'ApiError')) return;
    var stack = r.stack ? String(r.stack) : '';
    /* la première ligne de la pile qui vient du jeu dit où */
    var at = /(https?:\/\/[^\s)]+):(\d+):(\d+)/.exec(stack);
    if (at && !ours(at[1])) return;
    send(r.message ? (r.name || 'Error') + ': ' + r.message : String(r), at ? at[1] : '', at ? Number(at[2]) : 0, at ? Number(at[3]) : 0, stack);
  });
})();
