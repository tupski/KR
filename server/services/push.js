/* eslint-env node */
/* global process */
import { createRequire } from 'module';
import { query } from '../db/index.js';

const require = createRequire(import.meta.url);
// web-push is CommonJS; require() is the safest in ESM.
const webpush = require('web-push');

export function configWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@kakaramaroom.com';
  if (!publicKey || !privateKey) return null;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { publicKey, subject };
}

// Replaces: supabase.from('user_roles').select('user_id').eq('role', role)
export async function fetchUserIdsByRole(role) {
  const res = await query('SELECT user_id FROM public.user_roles WHERE role = $1', [role]);
  return res.rows.map((x) => x.user_id).filter(Boolean);
}

// Replaces: supabase.from('user_roles').select('user_id') + Set dedupe
export async function fetchAllUserIds() {
  const res = await query('SELECT DISTINCT user_id FROM public.user_roles');
  return res.rows.map((x) => x.user_id).filter(Boolean);
}

// Replaces: supabase.from('push_subscriptions').select(...).in('user_id', userIds)
export async function fetchSubscriptions(userIds) {
  if (!userIds || !userIds.length) return [];
  const res = await query(
    'SELECT user_id, endpoint, p256dh, auth FROM public.push_subscriptions WHERE user_id = ANY($1::uuid[])',
    [userIds]
  );
  return res.rows;
}

export async function sendPushToAudience({ title, body, url = '/', icon = '/kr-icon-192.svg', audience_role, audience_user_id }) {
  if (!configWebPush()) throw new Error('VAPID env belum lengkap.');

  let userIds = [];
  if (audience_user_id) userIds = [audience_user_id];
  else if (audience_role === 'all') userIds = await fetchAllUserIds();
  else if (audience_role) userIds = await fetchUserIdsByRole(audience_role);

  const subs = await fetchSubscriptions(userIds);
  const payload = JSON.stringify({ title, body, url, icon, badge: '/kr-icon-192.svg' });

  const results = { attempted: subs.length, sent: 0, failed: 0, failures: [] };
  for (const s of subs) {
    const subscription = {
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth },
    };
    try {
      await webpush.sendNotification(subscription, payload);
      results.sent += 1;
    } catch (e) {
      results.failed += 1;
      results.failures.push({ user_id: s.user_id, endpoint: s.endpoint, message: e?.message || 'Push failed' });
    }
  }
  return results;
}
