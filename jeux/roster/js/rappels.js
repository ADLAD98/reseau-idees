/* Le rappel « ton pack gratuit est prêt » : une notification sur cet appareil quand le pack gratuit redevient disponible (serveur :
   rappels.ts ; ici : l'abonnement, appareil par appareil, depuis le Profil). Le navigateur donne une adresse d'envoi et deux clés,
   que le serveur garde pour chiffrer le message. Sur iPhone et iPad, les notifications d'un site ne marchent qu'une fois le jeu
   ajouté à l'écran d'accueil, et ouvert depuis là. */
import { call } from './api.js';

/* la clé publique du jeu (VAPID), la même que sur le serveur */
const VAPID_PUBLIC = 'BIAF-AZqxPf5_oBlFfEJeZZoDmtPpwGdwh6UJEiKn54mkq5WP_T3xg1Poi-Nb0yBJhCO17AHw_ql39sR4Smc3no';
const key = () => Uint8Array.from(atob(VAPID_PUBLIC.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (VAPID_PUBLIC.length % 4)) % 4)), (c) => c.charCodeAt(0));

const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const INSTALLED = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** Ce que cet appareil permet : 'ok', 'ios' (ajouter d'abord le jeu à l'écran d'accueil), 'denied' (refusé dans le navigateur), 'no'. */
export function pushSupport() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return IOS && !INSTALLED ? 'ios' : 'no';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}
async function registration() {
  return navigator.serviceWorker.register('sw.js', { scope: './' }).then(() => navigator.serviceWorker.ready);
}
/** Le rappel est-il actif sur cet appareil ? */
export async function pushOn() {
  if (pushSupport() !== 'ok') return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration('./');
    return !!(reg && (await reg.pushManager.getSubscription()) && Notification.permission === 'granted');
  } catch (e) { return false; }
}
/** Active le rappel : la permission du navigateur, l'abonnement, puis le serveur. Rend true si c'est fait. */
export async function enablePush() {
  if ((await Notification.requestPermission()) !== 'granted') return false;
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key() });
  await call('POST', '/api/push', sub.toJSON());
  return true;
}
/** Coupe le rappel sur cet appareil. */
export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('./');
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return;
  try { await call('POST', '/api/push/off', { endpoint: sub.endpoint }); } finally { await sub.unsubscribe(); }
}
