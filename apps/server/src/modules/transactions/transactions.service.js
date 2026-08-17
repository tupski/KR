/**
 * @file transactions.service.js
 * @description Transaction management service layer.
 * All database operations go through the pg pool; no HTTP concerns here.
 */

import { query } from '../../config/database.js';
import { NotFoundError, ForbiddenError } from '../../middleware/errorHandler.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

/**
 * Build a dynamic WHERE clause from filter options.
 * Returns { whereClause, params } ready for parameterized queries.
 *
 * @param {{ startDate?: string, endDate?: string, location?: string, userId?: string, search?: string }} filters
 * @param {number} startIndex - Starting $N index for params (default 1)
 */
function buildWhereClause(filters, startIndex = 1) {
  const conditions = [];
  const params = [];
  let idx = startIndex;

  if (filters.startDate) {
    conditions.push(`t.created_at >= $${idx++}`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push(`t.created_at <= $${idx++}`);
    params.push(filters.endDate);
  }
  if (filters.location) {
    conditions.push(`t.apartment_location = $${idx++}`);
    params.push(filters.location);
  }
  if (filters.userId) {
    conditions.push(`t.created_by = $${idx++}`);
    params.push(filters.userId);
  }
  if (filters.search) {
    conditions.push(`(t.customer_name ILIKE $${idx} OR t.room_number ILIKE $${idx} OR t.marketing_name ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params, nextIdx: idx };
}

// ── Read queries ──────────────────────────────────────────────────────────────

/**
 * List transactions with pagination and optional filters.
 *
 * @param {{ page?: number, limit?: number, startDate?: string, endDate?: string, location?: string, userId?: string, search?: string }} opts
 * @returns {Promise<{ data: object[], total: number, page: number, limit: number }>}
 */
export async function listTransactions(opts = {}) {
  const { page = 1, limit = 20, ...filters } = opts;
  const safePage  = Math.max(1, Number(page)  || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const offset    = (safePage - 1) * safeLimit;

  const { whereClause, params, nextIdx } = buildWhereClause(filters);

  const dataResult = await query(
    `SELECT t.*
     FROM transactions t
     ${whereClause}
     ORDER BY t.created_at DESC
     LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
    [...params, safeLimit, offset],
  );

  const countResult = await query(
    `SELECT COUNT(*) FROM transactions t ${whereClause}`,
    params,
  );

  return {
    data:  dataResult.rows,
    total: Number(countResult.rows[0].count),
    page:  safePage,
    limit: safeLimit,
  };
}

/**
 * Get a single transaction by ID.
 *
 * @param {string} id - UUID
 * @returns {Promise<object>} Transaction row
 * @throws {NotFoundError} If transaction does not exist
 */
export async function getTransactionById(id) {
  const result = await query(
    'SELECT * FROM transactions WHERE id = $1 LIMIT 1',
    [id],
  );
  if (!result.rows[0]) {
    throw new NotFoundError('Transaction not found');
  }
  return result.rows[0];
}

/**
 * Get dashboard KPI summary for a date range and optional location.
 *
 * @param {{ startDate?: string, endDate?: string, location?: string }} opts
 * @returns {Promise<object>} Aggregated summary row
 */
export async function getDashboardSummary({ startDate, endDate, location } = {}) {
  const { whereClause, params } = buildWhereClause({ startDate, endDate, location });

  const result = await query(
    `SELECT
       COUNT(*)                                    AS total_transactions,
       COALESCE(SUM(cash_amount + transfer_amount), 0)  AS total_revenue,
       COALESCE(SUM(cash_amount), 0)              AS total_cash,
       COALESCE(SUM(transfer_amount), 0)          AS total_transfer,
       COALESCE(SUM(deposit_cash + deposit_transfer), 0) AS total_deposit,
       COALESCE(SUM(marketing_fee), 0)             AS total_marketing_fee,
       COALESCE(AVG(duration_days), 0)             AS avg_duration_days
     FROM transactions t
     ${whereClause}`,
    params,
  );

  return result.rows[0];
}

// ── Write queries ─────────────────────────────────────────────────────────────

/**
 * Create a new transaction record.
 *
 * @param {object} data - Transaction fields
 * @param {string} userId - UUID of the creator
 * @returns {Promise<object>} Created transaction row
 */
export async function createTransaction(data, userId) {
  const {
    customer_name,
    apartment_location,
    room_number,
    check_in,
    check_out,
    duration_days,
    price_per_day,
    cash_amount       = 0,
    transfer_amount   = 0,
    deposit_cash      = 0,
    deposit_transfer  = 0,
    marketing_name    = null,
    marketing_fee     = 0,
    ktp_image_url     = null,
    transfer_proof_url = null,
    guest_source      = null,
    notes             = null,
    checkin_at        = null,
  } = data;

  const result = await query(
    `INSERT INTO transactions (
       customer_name, apartment_location, room_number,
       check_in, check_out, duration_days,
       price_per_day,
       cash_amount, transfer_amount,
       deposit_cash, deposit_transfer,
       marketing_name, marketing_fee,
       ktp_image_url, transfer_proof_url,
       guest_source, notes, checkin_at,
       created_by
     ) VALUES (
       $1, $2, $3,
       $4, $5, $6,
       $7,
       $8, $9,
       $10, $11,
       $12, $13,
       $14, $15,
       $16, $17, $18,
       $19
     ) RETURNING *`,
    [
      customer_name, apartment_location, room_number,
      check_in, check_out, duration_days,
      price_per_day,
      cash_amount, transfer_amount,
      deposit_cash, deposit_transfer,
      marketing_name, marketing_fee,
      ktp_image_url, transfer_proof_url,
      guest_source, notes, checkin_at,
      userId,
    ],
  );

  return result.rows[0];
}

/**
 * Update an existing transaction.
 * Only the owner or an admin/super_admin may update.
 *
 * @param {string} id
 * @param {object} data - Partial transaction fields
 * @param {{ id: string, role: string }} requestingUser
 * @returns {Promise<object>} Updated transaction row
 */
export async function updateTransaction(id, data, requestingUser) {
  const existing = await getTransactionById(id);

  if (!ADMIN_ROLES.has(requestingUser.role) && existing.created_by !== requestingUser.id) {
    throw new ForbiddenError('You do not have permission to update this transaction');
  }

  const {
    customer_name,
    apartment_location,
    room_number,
    check_in,
    check_out,
    duration_days,
    price_per_day,
    cash_amount,
    transfer_amount,
    deposit_cash,
    deposit_transfer,
    marketing_name,
    marketing_fee,
    ktp_image_url,
    transfer_proof_url,
    guest_source,
    notes,
    checkin_at,
  } = data;

  const result = await query(
    `UPDATE transactions SET
       customer_name      = COALESCE($2,  customer_name),
       apartment_location = COALESCE($3,  apartment_location),
       room_number        = COALESCE($4,  room_number),
       check_in           = COALESCE($5,  check_in),
       check_out          = COALESCE($6,  check_out),
       duration_days      = COALESCE($7,  duration_days),
       price_per_day      = COALESCE($8,  price_per_day),
       cash_amount        = COALESCE($9,  cash_amount),
       transfer_amount    = COALESCE($10, transfer_amount),
       deposit_cash       = COALESCE($11, deposit_cash),
       deposit_transfer   = COALESCE($12, deposit_transfer),
       marketing_name     = COALESCE($13, marketing_name),
       marketing_fee      = COALESCE($14, marketing_fee),
       ktp_image_url      = COALESCE($15, ktp_image_url),
       transfer_proof_url = COALESCE($16, transfer_proof_url),
       guest_source       = COALESCE($17, guest_source),
       notes              = COALESCE($18, notes),
       checkin_at         = COALESCE($19, checkin_at),
       updated_at         = now()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      customer_name      ?? null,
      apartment_location ?? null,
      room_number        ?? null,
      check_in           ?? null,
      check_out          ?? null,
      duration_days      ?? null,
      price_per_day      ?? null,
      cash_amount        ?? null,
      transfer_amount    ?? null,
      deposit_cash       ?? null,
      deposit_transfer   ?? null,
      marketing_name     ?? null,
      marketing_fee      ?? null,
      ktp_image_url      ?? null,
      transfer_proof_url ?? null,
      guest_source       ?? null,
      notes              ?? null,
      checkin_at         ?? null,
    ],
  );

  return result.rows[0];
}

/**
 * Delete a transaction.
 * Only the owner or an admin/super_admin may delete.
 *
 * @param {string} id
 * @param {{ id: string, role: string }} requestingUser
 * @returns {Promise<void>}
 */
export async function deleteTransaction(id, requestingUser) {
  const existing = await getTransactionById(id);

  if (!ADMIN_ROLES.has(requestingUser.role) && existing.created_by !== requestingUser.id) {
    throw new ForbiddenError('You do not have permission to delete this transaction');
  }

  await query('DELETE FROM transactions WHERE id = $1', [id]);
}

/**
 * Mark the deposit for a transaction as returned.
 *
 * @param {string} id - Transaction UUID
 * @param {{ refundProofUrl?: string }} opts
 * @param {string} userId - UUID of the user performing the action
 * @returns {Promise<object>} Updated transaction row
 */
export async function markDepositReturned(id, { refundProofUrl = null } = {}, userId) {
  // Verify transaction exists first
  await getTransactionById(id);

  const result = await query(
    `UPDATE transactions
     SET
       deposit_returned_at      = now(),
       deposit_refund_proof_url = $2,
       deposit_returned_by      = $3,
       updated_at               = now()
     WHERE id = $1
     RETURNING *`,
    [id, refundProofUrl, userId],
  );

  return result.rows[0];
}

/**
 * Manual checkout - sets checkout_at to current time.
 *
 * @param {string} id - Transaction UUID
 * @param {string} userId - UUID of the user performing checkout
 * @returns {Promise<object>} Updated transaction row
 */
export async function manualCheckout(id, userId) {
  // Verify transaction exists first
  const tx = await getTransactionById(id);

  // Update checkout_at
  const result = await query(
    `UPDATE transactions
     SET checkout_at = now(), updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id],
  );

  return result.rows[0];
}
