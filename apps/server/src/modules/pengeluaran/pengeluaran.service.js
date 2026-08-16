/**
 * @file pengeluaran.service.js
 * @description Expense (pengeluaran) management service layer.
 * All database operations go through the pg pool; no HTTP concerns here.
 */

import { query } from '../../config/database.js';
import { NotFoundError } from '../../middleware/errorHandler.js';

// ── Read queries ──────────────────────────────────────────────────────────────

/**
 * List expenses with pagination and optional filters.
 *
 * @param {{ page?: number, limit?: number, startDate?: string, endDate?: string, category?: string }} opts
 * @returns {Promise<{ data: object[], total: number, page: number, limit: number }>}
 */
export async function listPengeluaran({ page = 1, limit = 20, startDate, endDate, category } = {}) {
  const safePage  = Math.max(1, Number(page)  || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const offset    = (safePage - 1) * safeLimit;

  const conditions = [];
  const params = [];
  let idx = 1;

  if (startDate) {
    conditions.push(`tanggal >= $${idx++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`tanggal <= $${idx++}`);
    params.push(endDate);
  }
  if (category) {
    conditions.push(`category = $${idx++}`);
    params.push(category);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT * FROM pengeluaran
       ${whereClause}
       ORDER BY tanggal DESC, created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, safeLimit, offset],
    ),
    query(
      `SELECT COUNT(*) FROM pengeluaran ${whereClause}`,
      params,
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
 * List all expense categories.
 *
 * @returns {Promise<object[]>} Category rows
 */
export async function listCategories() {
  const result = await query(
    'SELECT * FROM pengeluaran_categories ORDER BY name',
  );
  return result.rows;
}

// ── Write queries ─────────────────────────────────────────────────────────────

/**
 * Create a new expense record.
 *
 * @param {{ nama_pengeluaran: string, jumlah: number, tanggal: string, keterangan?: string, category?: string }} data
 * @param {string} userId - UUID of the creator
 * @returns {Promise<object>} Created expense row
 */
export async function createPengeluaran({ nama_pengeluaran, jumlah, tanggal, keterangan = null, category = null }, userId) {
  const result = await query(
    `INSERT INTO pengeluaran (nama_pengeluaran, jumlah, tanggal, keterangan, category, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [nama_pengeluaran, jumlah, tanggal, keterangan, category, userId],
  );
  return result.rows[0];
}

/**
 * Update an existing expense record.
 *
 * @param {string} id - UUID
 * @param {{ nama_pengeluaran?: string, jumlah?: number, tanggal?: string, keterangan?: string, category?: string }} data
 * @param {string} userId - UUID of the requesting user (for audit)
 * @returns {Promise<object>} Updated expense row
 * @throws {NotFoundError} If expense does not exist
 */
export async function updatePengeluaran(id, data, userId) {
  const { nama_pengeluaran, jumlah, tanggal, keterangan, category } = data;

  const result = await query(
    `UPDATE pengeluaran
     SET
       nama_pengeluaran = COALESCE($2, nama_pengeluaran),
       jumlah           = COALESCE($3, jumlah),
       tanggal          = COALESCE($4, tanggal),
       keterangan       = COALESCE($5, keterangan),
       category         = COALESCE($6, category),
       updated_by       = $7,
       updated_at       = now()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      nama_pengeluaran ?? null,
      jumlah           ?? null,
      tanggal          ?? null,
      keterangan       ?? null,
      category         ?? null,
      userId,
    ],
  );

  if (!result.rows[0]) {
    throw new NotFoundError('Pengeluaran not found');
  }
  return result.rows[0];
}

/**
 * Delete an expense record.
 *
 * @param {string} id - UUID
 * @param {string} userId - UUID of the requesting user (for audit log)
 * @returns {Promise<void>}
 * @throws {NotFoundError} If expense does not exist
 */
export async function deletePengeluaran(id, userId) {
  // userId param available for future audit logging
  void userId;

  const result = await query(
    'DELETE FROM pengeluaran WHERE id = $1 RETURNING id',
    [id],
  );
  if (!result.rows[0]) {
    throw new NotFoundError('Pengeluaran not found');
  }
}
