/**
 * @file activityLogs.service.js
 * @description Activity log service — read and write to activity_logs table.
 */

import { query } from '../../config/database.js';

/**
 * List activity logs with pagination and optional filters.
 *
 * @param {{ page?: number, limit?: number, userId?: string, startDate?: string, endDate?: string, action?: string }} opts
 * @returns {Promise<{ data: object[], total: number, page: number, limit: number }>}
 */
export async function listActivityLogs({ page, limit, userId, startDate, endDate, action } = {}) {
  const safePage  = Math.max(1, Number(page)  || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const offset    = (safePage - 1) * safeLimit;

  const conditions = [];
  const params     = [];
  let   idx        = 1;

  if (userId) {
    conditions.push(`user_id = $${idx++}`);
    params.push(userId);
  }
  if (startDate) {
    conditions.push(`created_at >= $${idx++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`created_at <= $${idx++}`);
    params.push(endDate);
  }
  if (action) {
    conditions.push(`action ILIKE $${idx++}`);
    params.push(`%${action}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT * FROM activity_logs ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, safeLimit, offset],
    ),
    query(`SELECT COUNT(*) FROM activity_logs ${where}`, params),
  ]);

  return {
    data:  dataResult.rows,
    total: Number(countResult.rows[0].count),
    page:  safePage,
    limit: safeLimit,
  };
}

/**
 * Insert an activity log entry.
 * Looks up user_name and role from user_profiles.
 *
 * @param {{ userId: string, action: string, details?: string, metadata?: object }} opts
 * @returns {Promise<object>} Inserted log row
 */
export async function logActivity({ userId, action, details = null, metadata = null }) {
  // Fetch user profile for denormalized fields
  const profileResult = await query(
    'SELECT full_name, role FROM user_profiles WHERE id = $1 LIMIT 1',
    [userId],
  );
  const profile  = profileResult.rows[0];
  const userName = profile?.full_name ?? null;
  const role     = profile?.role      ?? null;

  const result = await query(
    `INSERT INTO activity_logs (user_id, user_name, role, action, details, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, userName, role, action, details, metadata ? JSON.stringify(metadata) : null],
  );
  return result.rows[0];
}
