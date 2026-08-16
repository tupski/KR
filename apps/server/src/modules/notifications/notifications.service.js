/**
 * @file notifications.service.js
 * @description In-app notification management service layer.
 * All database operations go through the pg pool; no HTTP concerns here.
 */

import { query } from '../../config/database.js';

// ── Notifications ─────────────────────────────────────────────────────────────

/**
 * List notifications visible to a user, with pagination.
 * Includes notifications targeted by role, by user ID, or broadcast (no audience).
 * Excludes any notifications the user has hidden.
 *
 * @param {{ userId: string, role: string, page?: number, limit?: number }} opts
 * @returns {Promise<{ data: object[], total: number, page: number, limit: number }>}
 */
export async function listNotifications({ userId, role, page = 1, limit = 20 }) {
  const safePage  = Math.max(1, Number(page)  || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const offset    = (safePage - 1) * safeLimit;

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT n.*
       FROM notifications n
       WHERE
         (n.audience_role = $1 OR n.target_user_id = $2 OR (n.audience_role IS NULL AND n.target_user_id IS NULL))
         AND NOT EXISTS (
           SELECT 1 FROM notification_hidden nh
           WHERE nh.notification_id = n.id AND nh.user_id = $2
         )
       ORDER BY n.created_at DESC
       LIMIT $3 OFFSET $4`,
      [role, userId, safeLimit, offset],
    ),
    query(
      `SELECT COUNT(*)
       FROM notifications n
       WHERE
         (n.audience_role = $1 OR n.target_user_id = $2 OR (n.audience_role IS NULL AND n.target_user_id IS NULL))
         AND NOT EXISTS (
           SELECT 1 FROM notification_hidden nh
           WHERE nh.notification_id = n.id AND nh.user_id = $2
         )`,
      [role, userId],
    ),
  ]);

  return {
    data:  dataResult.rows,
    total: Number(countResult.rows[0].count),
    page:  safePage,
    limit: safeLimit,
  };
}

/**
 * Hide a notification for a specific user (soft-delete via junction table).
 *
 * @param {string} notificationId - UUID
 * @param {string} userId - UUID
 * @returns {Promise<void>}
 */
export async function hideNotification(notificationId, userId) {
  await query(
    `INSERT INTO notification_hidden (notification_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [notificationId, userId],
  );
}

// ── Preferences ───────────────────────────────────────────────────────────────

/**
 * Get push notification preferences for a user.
 *
 * @param {string} userId
 * @returns {Promise<object|null>} Preferences row or null
 */
export async function getPreferences(userId) {
  const result = await query(
    'SELECT * FROM notification_preferences WHERE user_id = $1 LIMIT 1',
    [userId],
  );
  return result.rows[0] ?? null;
}

/**
 * Insert or update push notification preferences for a user.
 *
 * @param {string} userId
 * @param {{ push_enabled?: boolean, types_enabled?: object }} prefs
 * @returns {Promise<object>} Upserted preferences row
 */
export async function upsertPreferences(userId, { push_enabled, types_enabled }) {
  const result = await query(
    `INSERT INTO notification_preferences (user_id, push_enabled, types_enabled)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET push_enabled  = COALESCE(EXCLUDED.push_enabled,  notification_preferences.push_enabled),
           types_enabled = COALESCE(EXCLUDED.types_enabled, notification_preferences.types_enabled),
           updated_at    = now()
     RETURNING *`,
    [userId, push_enabled ?? null, types_enabled ? JSON.stringify(types_enabled) : null],
  );
  return result.rows[0];
}

// ── Push subscriptions ────────────────────────────────────────────────────────

/**
 * Subscribe a user to push notifications (upsert by endpoint).
 *
 * @param {string} userId
 * @param {{ endpoint: string, p256dh: string, auth: string }} subscription
 * @returns {Promise<object>} Upserted subscription row
 */
export async function subscribe(userId, { endpoint, p256dh, auth }) {
  const result = await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, endpoint) DO UPDATE
       SET p256dh     = EXCLUDED.p256dh,
           auth       = EXCLUDED.auth,
           updated_at = now()
     RETURNING *`,
    [userId, endpoint, p256dh, auth],
  );
  return result.rows[0];
}

/**
 * Remove a specific push subscription.
 *
 * @param {string} userId
 * @param {string} endpoint
 * @returns {Promise<void>}
 */
export async function unsubscribe(userId, endpoint) {
  await query(
    'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
    [userId, endpoint],
  );
}

// ── Notification upsert ───────────────────────────────────────────────────────

/**
 * Insert a notification record with deduplication by dedupe_key.
 *
 * @param {{ title: string, body?: string, url?: string, icon?: string, audience_role?: string, target_user_id?: string, dedupe_key?: string, type?: string }} payload
 * @returns {Promise<{ id: string, inserted: boolean }>}
 */
export async function upsertNotification(payload) {
  const {
    title,
    body          = null,
    url           = null,
    icon          = null,
    audience_role = null,
    target_user_id = null,
    dedupe_key    = null,
    type          = null,
  } = payload;

  // If dedupe_key provided, check for existing record first
  if (dedupe_key) {
    const existing = await query(
      'SELECT id FROM notifications WHERE dedupe_key = $1 LIMIT 1',
      [dedupe_key],
    );
    if (existing.rows[0]) {
      return { id: existing.rows[0].id, inserted: false };
    }
  }

  const result = await query(
    `INSERT INTO notifications (title, body, url, icon, audience_role, target_user_id, dedupe_key, type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [title, body, url, icon, audience_role, target_user_id, dedupe_key, type],
  );

  return { id: result.rows[0].id, inserted: true };
}
