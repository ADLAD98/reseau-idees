/* Dialogue avec le serveur du jeu : connexion, appels, et dérivation du mot de passe. */
import { API_BASE, STORE } from './config.js';

export class ApiError extends Error {
  constructor(status, code, message, data) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data || {};
  }
}

let token = null;

/** Relit la connexion gardée dans ce navigateur : { token, name } ou null. */
export function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE + 'session') || 'null');
    token = s && s.token ? s.token : null;
    return token ? s : null;
  } catch (e) {
    return null;
  }
}
export function saveSession(s) {
  token = s.token;
  try { localStorage.setItem(STORE + 'session', JSON.stringify(s)); } catch (e) { /* navigation privée : la connexion ne dure que le temps de la page */ }
}
export function clearSession() {
  token = null;
  try { localStorage.removeItem(STORE + 'session'); } catch (e) { /* rien à effacer */ }
}

export async function call(method, path, body) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw new ApiError(0, 'reseau', 'Serveur injoignable. Vérifie ta connexion.');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  /* écart entre l'horloge du serveur et celle de cet appareil, mesuré à l'instant de la réponse */
  const stamp = (o) => { if (o && typeof o.now === 'number') o.skew = o.now - Date.now(); };
  stamp(data);
  if (!res.ok) {
    const err = (data && data.error) || {};
    stamp(err);
    throw new ApiError(res.status, err.code || 'erreur', err.message || 'Le serveur a répondu ' + res.status + '.', err);
  }
  return data;
}

const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/** Le mot de passe ne quitte jamais le navigateur : on en tire une clé (calcul lent exprès), et seule cette clé part au serveur. */
export async function deriveKey(name, password) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('bcorps-cartes:' + name.trim().toLowerCase()), iterations: 310000 },
    base, 256);
  return toHex(bits);
}
