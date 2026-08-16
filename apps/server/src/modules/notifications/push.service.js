/**
 * @file push.service.js
 * @description Web Push notification service.
 * Ported from api/send-push.js — uses pg pool instead of Supabase.
 */

import { createRequire } from 'module';
import { query } from '../../config/database.js';
import { env } from '../../config/env.js';

// web-push is CommonJS; use createRequire for safe ESM interop
const require = createRequire(import.meta.url);
const webpush = require('web-push');

// ── VAPID setup ───────────────────────────────────────────────────────────────

/**
 * Configure web-push with VAPID keys from environment.
 * Call once at application startup.
 *
 * @returns {void}
 * @throws {Error} If VAPID env vars are missing
 */
export function configureWebPush() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('⚠️  VAPID keys not configured — push notifications disabled');
    return;
  }

  webpush.setVapidDetails(
    VAPID_SUBJECT || 'mailto:admin@kakaramaroom.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
}

// ── DB helpers ────────────────────────────────────────────────────────────────

/**
 * Get all user IDs that have a specific role.
 *
 * @param {string} role
 * @returns {Promise<string[]>} Array of user_id UUIDs
 */
export async function getUserIdsByRole(role) {
  const result = await query(
    'SELECT user_id FROM user_roles WHERE role = $1',
    [role],
  );
  return result.rows.map((r) => r.user_id).filter(Boolean);
}

/**
 * Get all push subscriptions for a list of user IDs.
 *
 * @param {string[]} userIds
 * @returns {Promise<Array<{ user_id: string, endpoint: string, p256dh: string, auth: string }>>}
 */
export async function getSubscriptionsByUserIds(userIds) {
  if (!userIds.length) return [];

  const result = await query(
    'SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1)',
    [userIds],
  );
  return result.rows;
}

// ── Send helpers ──────────────────────────────────────────────────────────────

/**
 * Send a push notification to a specific subscription.
 * Returns true on success, false on failure.
 *
 * @param {{ endpoint: string, p256dh: string, auth: string }} subscription
 * @param {string} payloadJson - JSON stringified payload
 * @returns {Promise<boolean>}
 */
async function sendToSubscription(subscription, payloadJson) {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payloadJson,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Send a push notification to an audience (by role or specific user).
 *
 * @param {{ title: string, body?: string, url?: string, icon?: string, audience_role?: string, audience_user_id?: string }} opts
 * @returns {Promise<{ attempted: number, sent: number, failed: number, failures: string[] }>}
 */
export async function sendPushToAudience({ title, body, url = '/', icon = '/pwa-icon-192.svg', audience_role, audience_user_id }) {
  let userIds = [];

  if (audience_user_id) {
    userIds = [audience_user_id];
  } else if (audience_role === 'all') {
    const result = await query('SELECT user_id FROM user_roles');
    userIds = [...new Set(result.rows.map((r) => r.user_id).filter(Boolean))];
  } else if (audience_role) {
    userIds = await getUserIdsByRole(audience_role);
  }

  const subs = await getSubscriptionsByUserIds(userIds);
  const payloadJson = JSON.stringify({
    title,
    body,
    url,
    icon,
    badge: '/pwa-icon-192.svg',
  });

  const results = { attempted: subs.length, sent: 0, failed: 0, failures: [] };

  for (const sub of subs) {
    const ok = await sendToSubscription(sub, payloadJson);
    if (ok) {
      results.sent++;
    } else {
      results.failed++;
      results.failures.push(sub.endpoint);
    }
  }

  return results;
}

/**
 * Send a push notification to a specific user.
 *
 * @param {string} userId
 * @param {{ title: string, body?: string, url?: string, icon?: string }} payload
 * @returns {Promise<{ attempted: number, sent: number, failed: number, failures: string[] }>}
 */
export async function sendPushToUser(userId, payload) {
  return sendPushToAudience({ ...payload, audience_user_id: userId });
}
