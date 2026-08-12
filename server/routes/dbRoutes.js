// DB CRUD bridge: whitelist tabel + kolom, prepared statements, pagination wajib.
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { sendError } from '../errors.js';

export const ALLOWED_TABLES = new Set([
  'transactions', 'pengeluaran', 'tagihan_bulanan', 'tagihan_fee_lunas', 'tagihan_fee_lunas_items',
  'marketing_list', 'karyawan_list', 'lokasi_apartemen', 'nomor_kamar', 'user_profiles', 'user_roles',
  'user_location_assignments', 'notifications', 'notification_reads', 'notification_hidden',
  'notification_preferences', 'push_subscriptions', 'requests', 'pengeluaran_categories',
  'activity_logs', 'system_settings', 'role_menu_visibility', 'recurring_unit_bills',
]);

const COL_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertCol(col, label) {
  if (!col || !COL_RE.test(String(col))) {
    const err = new Error(`invalid ${label}: ${String(col)}`);
    err.status = 400;
    err.isValidation = true;
    throw err;
  }
}

function sanitizeColumns(select) {
  if (!select) return '*';
  const parts = String(select).split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return '*';
  for (const c of parts) assertCol(c, 'select col');
  return parts.join(',');
}

// filter=<json> [{ col, op: eq|gte|lte|lt|gt|in|is|like, value }]
function buildWhere(filter) {
  const OPS = { eq: '=', gte: '>=', lte: '<=', lt: '<', gt: '>', is: 'IS', like: 'LIKE' };
  const items = Array.isArray(filter) ? filter : [];
  const clauses = [];
  const params = [];
  for (const f of items) {
    assertCol(f.col, 'filter col');
    if (f.op === 'in') {
      const arr = Array.isArray(f.value) ? f.value : [f.value];
      const ph = arr.map((_, i) => `$${params.length + i + 1}`).join(',');
      clauses.push(`${f.col} IN (${ph})`);
      params.push(...arr);
    } else {
      const op = OPS[f.op] || '=';
      params.push(f.value);
      clauses.push(`${f.col} ${op} $${params.length}`);
    }
  }
  return { where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', params };
}

function parseRange(range) {
  const [offset, limit] = String(range || '0,50').split(',').map(Number);
  const lim = Math.min(Number.isFinite(limit) && limit > 0 ? limit : 50, 200);
  const off = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  return { offset: off, limit: lim };
}

function buildOrder(order, asc) {
  const col = String(order || 'created_at').trim();
  assertCol(col, 'order col');
  return ` ORDER BY ${col} ${asc === 'false' ? 'DESC' : 'ASC'}`;
}

export default function dbRoutes({ pool, cfg }) {
  const router = Router();
  const auth = requireAuth(cfg.jwtSecret, pool);

  router.get('/:table', auth, async (req, res) => {
    try {
      const t = req.params.table;
      if (!ALLOWED_TABLES.has(t)) return res.status(400).json({ error: `table ${t} not allowed` });

      const cols = sanitizeColumns(req.query.select);
      const { where, params } = buildWhere(JSON.parse(req.query.filter || '[]'));
      const { offset, limit } = parseRange(req.query.range);
      const orderClause = buildOrder(req.query.order, req.query.asc);
      const base = `FROM ${t} ${where}`;
      const sql = `SELECT ${cols} ${base} ${orderClause} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

      const [dataRes, countRes] = await Promise.all([
        pool.query(sql, [...params, limit, offset]),
        pool.query(`SELECT count(*)::int AS total ${base}`, params),
      ]);

      res.json({ data: dataRes.rows, totalCount: countRes.rows[0]?.total ?? dataRes.rows.length });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/:table', auth, async (req, res) => {
    try {
      const t = req.params.table;
      if (!ALLOWED_TABLES.has(t)) return res.status(400).json({ error: `table ${t} not allowed` });
      const body = req.body || {};
      const cols = Object.keys(body).filter((c) => { assertCol(c, 'insert col'); return true; });
      const values = cols.map((c) => body[c]);
      const sql = `INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`;
      const { rows } = await pool.query(sql, values);
      res.json({ data: rows[0] });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch('/:table/:id', auth, async (req, res) => {
    try {
      const t = req.params.table;
      if (!ALLOWED_TABLES.has(t)) return res.status(400).json({ error: `table ${t} not allowed` });
      const body = req.body || {};
      const cols = Object.keys(body).filter((c) => { assertCol(c, 'update col'); return c !== 'id'; });
      if (!cols.length) return res.status(400).json({ error: 'no updatable columns' });
      const setSql = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
      const values = cols.map((c) => body[c]);
      const { rows } = await pool.query(
        `UPDATE ${t} SET ${setSql} WHERE id = $${cols.length + 1} RETURNING *`,
        [...values, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'row not found' });
      res.json({ data: rows[0] });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/:table/:id', auth, async (req, res) => {
    try {
      const t = req.params.table;
      if (!ALLOWED_TABLES.has(t)) return res.status(400).json({ error: `table ${t} not allowed` });
      const { rowCount } = await pool.query(`DELETE FROM ${t} WHERE id = $1`, [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: 'row not found' });
      res.json({ data: { deleted: rowCount } });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}