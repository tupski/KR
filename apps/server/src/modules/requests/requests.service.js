/**
 * @file requests.service.js
 * @description Employee request management service (leave, schedule changes, etc.).
 * Karyawan hanya dapat melihat request milik sendiri; admin melihat semua.
 */

import { query } from '../../config/database.js';
import { NotFoundError, ForbiddenError } from '../../middleware/errorHandler.js';
import { logActivity } from '../activity-logs/activityLogs.service.js';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

/**
 * Build WHERE clause for request filters.
 * @param {{ status?: string, userId?: string, location?: string, isAdmin?: boolean, requestingUserId?: string }} filters
 * @returns {{ whereClause: string, params: any[], nextIdx: number }}
 */
function buildWhereClause(filters) {
  const conditions = [];
  const params     = [];
  let   idx        = 1;

  // Non-admins can only see their own requests
  if (!filters.isAdmin && filters.requestingUserId) {
    conditions.push(`r.created_by = $${idx++}`);
    params.push(filters.requestingUserId);
  } else if (filters.userId) {
    conditions.push(`r.created_by = $${idx++}`);
    params.push(filters.userId);
  }

  if (filters.status) {
    conditions.push(`r.status = $${idx++}`);
    params.push(filters.status);
  }

  if (filters.location) {
    conditions.push(`r.apartment_location = $${idx++}`);
    params.push(filters.location);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params, nextIdx: idx };
}

/**
 * List requests with pagination and optional filters.
 *
 * @param {{ page?: number, limit?: number, status?: string, userId?: string, location?: string, isAdmin?: boolean, requestingUserId?: string }} opts
 * @returns {Promise<{ data: object[], total: number, page: number, limit: number }>}
 */
export async function listRequests(opts = {}) {
  const { page = 1, limit = 20 } = opts;
  const safePage  = Math.max(1, Number(page)  || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset    = (safePage - 1) * safeLimit;

  const { whereClause, params, nextIdx } = buildWhereClause(opts);

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT r.*, u.full_name AS created_by_name
       FROM requests r
       LEFT JOIN user_profiles u ON u.id = r.created_by
       ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
      [...params, safeLimit, offset],
    ),
    query(`SELECT COUNT(*) FROM requests r ${whereClause}`, params),
  ]);

  return {
    data:  dataResult.rows,
    total: Number(countResult.rows[0].count),
    page:  safePage,
    limit: safeLimit,
  };
}

/**
 * Get a single request by ID.
 *
 * @param {string} id
 * @returns {Promise<object>}
 * @throws {NotFoundError}
 */
export async function getRequestById(id) {
  const result = await query(
    `SELECT r.*, u.full_name AS created_by_name
     FROM requests r
     LEFT JOIN user_profiles u ON u.id = r.created_by
     WHERE r.id = $1
     LIMIT 1`,
    [id],
  );
  if (!result.rows[0]) throw new NotFoundError('Request not found');
  return result.rows[0];
}

/**
 * Create a new request.
 *
 * @param {{ request_type: string, apartment_location?: string, desired_date?: string, notes?: string, employee_name?: string }} data
 * @param {string} userId - creator UUID
 * @returns {Promise<object>}
 */
export async function createRequest(
  { request_type, apartment_location = null, desired_date = null, notes = null, employee_name = null, amount = null },
  userId,
) {
  const result = await query(
    `INSERT INTO requests
       (request_type, apartment_location, desired_date, notes, employee_name, amount, created_by, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending')
     RETURNING *`,
    [request_type, apartment_location, desired_date, notes, employee_name, amount, userId],
  );
  const newRequest = result.rows[0];

  // Log activity
  await logActivity({
    userId,
    action: 'request_created',
    details: `Created ${request_type} request`,
    metadata: { requestId: newRequest.id, requestType: request_type, location: apartment_location },
  });

  return newRequest;
}

/**
 * Update the status of a request (admin action).
 *
 * @param {string} id
 * @param {{ status: string, response_notes?: string }} data
 * @param {string} respondedBy - admin user UUID
 * @returns {Promise<object>}
 */
export async function updateRequestStatus(id, { status, response_notes = null }, respondedBy) {
  const existingRequest = await getRequestById(id);

  const result = await query(
    `UPDATE requests
     SET
       status         = $1,
       response_notes = $2,
       responded_by   = $3,
       responded_at   = now(),
       updated_at     = now()
     WHERE id = $4
     RETURNING *`,
    [status, response_notes, respondedBy, id],
  );
  const updatedRequest = result.rows[0];

  // Log activity
  await logActivity({
    userId: respondedBy,
    action: 'request_status_updated',
    details: `Updated request status to ${status}`,
    metadata: {
      requestId: id,
      oldStatus: existingRequest.status,
      newStatus: status,
      requestType: existingRequest.request_type,
    },
  });

  return updatedRequest;
}

/**
 * Delete a request by ID.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteRequest(id) {
  await getRequestById(id);
  await query('DELETE FROM requests WHERE id = $1', [id]);
}
