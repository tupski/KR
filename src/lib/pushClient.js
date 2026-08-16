import { notificationsApi } from '@/api/notifications.api';

export function isPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function registerPushSubscription({ vapidPublicKey }) {
  if (!isPushSupported()) throw new Error('Push tidak didukung di perangkat ini.');
  if (!vapidPublicKey) throw new Error('VAPID public key belum diset.');

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  const converted = urlBase64ToUint8Array(vapidPublicKey);
  return await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: converted,
  });
}

export async function saveSubscriptionToServer(subscription, userId) {
  if (!subscription || !userId) return;
  const json = subscription.toJSON();
  const payload = {
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: json?.keys?.p256dh || '',
    auth: json?.keys?.auth || '',
  };
  await notificationsApi.subscribe(payload);
}

// Backward compatibility alias
export const saveSubscriptionToSupabase = saveSubscriptionToServer;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

