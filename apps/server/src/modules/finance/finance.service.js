/**
 * @file finance.service.js
 * @description Finance service — tagihan bulanan, fee marketing, deposit management.
 * Uses pg pool query() directly; calls existing PostgreSQL RPCs for atomic operations.
 */

import { query } from '../../config/database.js';
import { NotFoundError } from '../../middleware/errorHandler.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalize safe pagination values.
 * @param {number} page
 * @param {number} limit
 * @returns {{ safePage: number, safeLimit: number, offset: number }}
 */
function paginate(page = 1, limit = 20) {
  const safePage  = Math.max(1, Number(page)  || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  return { safePage, safeLimit, offset: (safePage - 1) * safeLimit };
}

// ── Tagihan Bulanan ───────────────────────────────────────────────────────────

/**
 * List tagihan_bulanan with optional filters and pagination.
 *
 * @param {{ page?: number, limit?: number, status?: string, location?: string, roomNumber?: string }} opts
 * @returns {Promise<{ data: object[], total: number, page: number, limit: number }>}
 */
export async function listTagihanBulanan({ page, limit, status, location, roomNumber } = {}) {
  const { safePage, safeLimit, offset } = paginate(page, limit);

  const conditions = [];
  const params     = [];
  let   idx        = 1;

  if (status) {
    conditions.push(`status = $${idx++}`);
    params.push(status);
  }
  if (location) {
    conditions.push(`apartment_location = $${idx++}`);
    params.push(location);
  }
  if (roomNumber) {
    conditions.push(`room_number = $${idx++}`);
    params.push(roomNumber);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT * FROM tagihan_bulanan ${where} ORDER BY due_date DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, safeLimit, offset],
    ),
    query(`SELECT COUNT(*) FROM tagihan_bulanan ${where}`, params),
  ]);

  return {
    data:  dataResult.rows,
    total: Number(countResult.rows[0].count),
    page:  safePage,
    limit: safeLimit,
  };
}

/**
 * Get a single tagihan_bulanan by ID.
 *
 * @param {string} id
 * @returns {Promise<object>}
 * @throws {NotFoundError}
 */
export async function getTagihanBulananById(id) {
  const result = await query(
    'SELECT * FROM tagihan_bulanan WHERE id = $1 LIMIT 1',
    [id],
  );
  if (!result.rows[0]) throw new NotFoundError('Tagihan not found');
  return result.rows[0];
}

/**
 * Create a new tagihan_bulanan record.
 *
 * @param {{ apartment_location: string, room_number: string, amount: number, due_date: string, is_recurring?: boolean }} data
 * @param {string} userId - creator UUID
 * @returns {Promise<object>}
 */
export async function createTagihanBulanan(
  { apartment_location, room_number, amount, due_date, is_recurring = false },
  userId,
) {
  const result = await query(
    `INSERT INTO tagihan_bulanan
       (apartment_location, room_number, amount, due_date, is_recurring, created_by, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'unpaid')
     RETURNING *`,
    [apartment_location, room_number, amount, due_date, is_recurring, userId],
  );
  return result.rows[0];
}

/**
 * Mark a tagihan_bulanan as paid via RPC.
 * Calls pay_tagihan_bulanan(p_user_id, p_tagihan_id, p_proof_url).
 *
 * @param {string} tagihanId
 * @param {string|null} proofUrl
 * @param {string} userId
 * @returns {Promise<any>} RPC result
 */
export async function payTagihanBulanan(tagihanId, proofUrl, userId) {
  // Verify exists first
  await getTagihanBulananById(tagihanId);

  const result = await query(
    'SELECT pay_tagihan_bulanan($1, $2, $3) AS result',
    [userId, tagihanId, proofUrl ?? null],
  );
  return result.rows[0]?.result ?? null;
}

/**
 * Delete a tagihan_bulanan by ID.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteTagihanBulanan(id) {
  await getTagihanBulananById(id);
  await query('DELETE FROM tagihan_bulanan WHERE id = $1', [id]);
}

// ── Fee Marketing ─────────────────────────────────────────────────────────────

/**
 * List paid fee batches (tagihan_fee_lunas) with pagination.
 *
 * @param {{ page?: number, limit?: number, startDate?: string, endDate?: string, marketingName?: string }} opts
 * @returns {Promise<{ data: object[], total: number, page: number, limit: number }>}
 */
export async function listTagihanFeeLunas({ page, limit, startDate, endDate, marketingName } = {}) {
  const { safePage, safeLimit, offset } = paginate(page, limit);

  const conditions = [];
  const params     = [];
  let   idx        = 1;

  if (marketingName) {
    conditions.push(`marketing_name ILIKE $${idx++}`);
    params.push(`%${marketingName}%`);
  }
  if (startDate) {
    conditions.push(`paid_at >= $${idx++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`paid_at <= $${idx++}`);
    params.push(endDate);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT * FROM tagihan_fee_lunas ${where} ORDER BY paid_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, safeLimit, offset],
    ),
    query(`SELECT COUNT(*) FROM tagihan_fee_lunas ${where}`, params),
  ]);

  return {
    data:  dataResult.rows,
    total: Number(countResult.rows[0].count),
    page:  safePage,
    limit: safeLimit,
  };
}

/**
 * List transaction items whose marketing fee has NOT yet been settled.
 *
 * @param {{ marketingName?: string, startDate?: string, endDate?: string }} opts
 * @returns {Promise<object[]>}
 */
export async function listUnpaidFeeItems({ marketingName, startDate, endDate } = {}) {
  const conditions = ['t.marketing_fee > 0', 'i.id IS NULL'];
  const params     = [];
  let   idx        = 1;

  if (marketingName) {
    conditions.push(`t.marketing_name ILIKE $${idx++}`);
    params.push(`%${marketingName}%`);
  }
  if (startDate) {
    conditions.push(`t.created_at >= $${idx++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`t.created_at <= $${idx++}`);
    params.push(endDate);
  }

  const result = await query(
    `SELECT t.*
     FROM transactions t
     LEFT JOIN tagihan_fee_lunas_items i ON i.transaction_id = t.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.created_at DESC`,
    params,
  );
  return result.rows;
}

/**
 * Settle marketing fee items via RPC.
 * Calls pay_fee_items(p_user_id, p_marketing_name, p_transaction_ids, p_proof_url).
 *
 * @param {string}   marketingName
 * @param {string[]} transactionIds
 * @param {string|null} proofUrl
 * @param {string}   userId
 * @returns {Promise<any>} RPC result
 */
export async function payFeeItems(marketingName, transactionIds, proofUrl, userId) {
  const result = await query(
    'SELECT pay_fee_items($1, $2, $3, $4) AS result',
    [userId, marketingName, transactionIds, proofUrl ?? null],
  );
  return result.rows[0]?.result ?? null;
}

// ── Deposit Management ────────────────────────────────────────────────────────

/**
 * List transactions that have a deposit, with optional filter for returned status.
 *
 * @param {{ page?: number, limit?: number, location?: string, returned?: string }} opts
 * @returns {Promise<{ data: object[], total: number, page: number, limit: number }>}
 */
export async function listTransactionsWithDeposit({ page, limit, location, returned } = {}) {
  const { safePage, safeLimit, offset } = paginate(page, limit);

  const conditions = ['(deposit_cash > 0 OR deposit_transfer > 0)'];
  const params     = [];
  let   idx        = 1;

  if (returned === 'true') {
    conditions.push('deposit_returned_at IS NOT NULL');
  } else if (returned === 'false') {
    conditions.push('deposit_returned_at IS NULL');
  }

  if (location) {
    conditions.push(`apartment_location = $${idx++}`);
    params.push(location);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT * FROM transactions ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, safeLimit, offset],
    ),
    query(`SELECT COUNT(*) FROM transactions ${where}`, params),
  ]);

  return {
    data:  dataResult.rows,
    total: Number(countResult.rows[0].count),
    page:  safePage,
    limit: safeLimit,
  };
}
