/**
 * @file settings.service.js
 * @description System settings and announcements service layer.
 * All database operations go through the pg pool; no HTTP concerns here.
 */

import { query } from '../../config/database.js';
import { NotFoundError } from '../../middleware/errorHandler.js';

// ── Settings ──────────────────────────────────────────────────────────────────

/**
 * Get all system settings.
 *
 * @returns {Promise<object[]>} All setting rows
 */
export async function getAllSettings() {
  const result = await query(
    'SELECT key, value, description, updated_at FROM system_settings ORDER BY key',
  );
  return result.rows;
}

/**
 * Get a single setting value by key.
 *
 * @param {string} key
 * @returns {Promise<string|null>} Setting value or null
 */
export async function getSetting(key) {
  const result = await query(
    'SELECT value FROM system_settings WHERE key = $1 LIMIT 1',
    [key],
  );
  return result.rows[0]?.value ?? null;
}

/**
 * Insert or update a system setting.
 *
 * @param {string} key
 * @param {string} value
 * @param {string} [description]
 * @returns {Promise<object>} Upserted setting row
 */
export async function upsertSetting(key, value, description) {
  const result = await query(
    `INSERT INTO system_settings (key, value, description)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE
       SET value       = EXCLUDED.value,
           description = COALESCE(EXCLUDED.description, system_settings.description),
           updated_at  = now()
     RETURNING *`,
    [key, value, description ?? null],
  );
  return result.rows[0];
}

// ── Announcements ─────────────────────────────────────────────────────────────

/**
 * List announcements, optionally filtering to only active ones.
 *
 * @param {{ active_only?: boolean }} opts
 * @returns {Promise<object[]>} Announcement rows
 */
export async function listAnnouncements({ active_only = false } = {}) {
  const whereClause = active_only ? 'WHERE is_active = true' : '';
  const result = await query(
    `SELECT * FROM announcements ${whereClause} ORDER BY created_at DESC`,
  );
  return result.rows;
}

/**
 * Create a new announcement.
 *
 * @param {{ title: string, content: string, createdBy: string }} data
 * @returns {Promise<object>} Created announcement row
 */
export async function createAnnouncement({ title, content, createdBy }) {
  const result = await query(
    `INSERT INTO announcements (title, content, created_by)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [title, content, createdBy],
  );
  return result.rows[0];
}

/**
 * Update an existing announcement.
 *
 * @param {string} id - UUID
 * @param {{ title?: string, content?: string, is_active?: boolean }} data
 * @returns {Promise<object>} Updated announcement row
 * @throws {NotFoundError} If announcement does not exist
 */
export async function updateAnnouncement(id, { title, content, is_active }) {
  const result = await query(
    `UPDATE announcements
     SET
       title      = COALESCE($2, title),
       content    = COALESCE($3, content),
       is_active  = COALESCE($4, is_active),
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, title ?? null, content ?? null, is_active ?? null],
  );

  if (!result.rows[0]) {
    throw new NotFoundError('Announcement not found');
  }
  return result.rows[0];
}

/**
 * Delete an announcement by ID.
 *
 * @param {string} id - UUID
 * @returns {Promise<void>}
 * @throws {NotFoundError} If announcement does not exist
 */
export async function deleteAnnouncement(id) {
  const result = await query(
    'DELETE FROM announcements WHERE id = $1 RETURNING id',
    [id],
  );
  if (!result.rows[0]) {
    throw new NotFoundError('Announcement not found');
  }
}
