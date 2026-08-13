// DB CRUD bridge: whitelist tabel + kolom, prepared statements, pagination wajib,
// RBAC per tabel + scoping baris (karyawan hanya data miliknya).
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

// ── RBAC: per-table permission map ──────────────────────────────────────────
// Setiap aksi (select/insert/update/delete) → role yang diizinkan.
// Tabel yang tidak terdaftar → deny by default.
const ALL = ['karyawan', 'admin', 'super_admin'];
const ADMIN = ['admin', 'super_admin'];
const SUPER = ['super_admin'];

const TABLE_PERMS = {
  transactions:              { select: ALL,   insert: ALL,   update: ALL,   delete: ADMIN, updateCols: { karyawan: ['checkout_at'] } },
  pengeluaran:               { select: ADMIN, insert: ADMIN, update: ADMIN, delete: ADMIN },
  tagihan_bulanan:           { select: ADMIN, insert: ADMIN, update: ADMIN, delete: ADMIN },
  tagihan_fee_lunas:         { select: ALL,   insert: ADMIN, update: ADMIN, delete: ADMIN },
  tagihan_fee_lunas_items:   { select: ADMIN, insert: ADMIN, update: ADMIN, delete: ADMIN },
  marketing_list:            { select: ALL,   insert: ALL,   update: ADMIN, delete: ADMIN },
  karyawan_list:             { select: ALL,   insert: ALL,   update: ADMIN, delete: ADMIN },
  lokasi_apartemen:          { select: ALL,   insert: ADMIN, update: ADMIN, delete: ADMIN },
  nomor_kamar:               { select: ALL,   insert: ADMIN, update: ADMIN, delete: ADMIN },
  pengeluaran_categories:    { select: ADMIN, insert: ADMIN, update: ADMIN, delete: ADMIN },
  recurring_unit_bills:      { select: ADMIN, insert: ADMIN, update: ADMIN, delete: ADMIN },
  user_profiles:             { select: ALL,   insert: ALL,   update: ALL,   delete: SUPER },
  user_roles:                { select: ALL,   insert: SUPER, update: SUPER, delete: SUPER },
  user_location_assignments: { select: ALL,   insert: SUPER, update: SUPER, delete: SUPER },
  role_menu_visibility:      { select: ALL,   insert: SUPER, update: SUPER, delete: SUPER },
  system_settings:           { select: ALL,   insert: SUPER, update: SUPER, delete: SUPER },
  activity_logs:             { select: SUPER, insert: [],    update: [],    delete: [] },
  notifications:             { select: ALL,   insert: ADMIN, update: ADMIN, delete: ADMIN },
  notification_reads:        { select: ALL,   insert: ALL,   update: ALL,   delete: ADMIN },
  notification_hidden:       { select: ALL,   insert: ALL,   update: ALL,   delete: ADMIN },
  notification_preferences:  { select: ALL,   insert: ALL,   update: ALL,   delete: ADMIN },
  push_subscriptions:        { select: ALL,   insert: ALL,   update: ALL,   delete: ADMIN },
  requests:                  { select: ALL,   insert: ALL,   update: ADMIN, delete: ADMIN },
};

// Row-level scoping: karyawan hanya melihat/mengubah baris miliknya sendiri.
const SCOPE_OWN = {
  user_profiles:            { col: 'id',      on: ['select', 'insert', 'update', 'delete'] },
  requests:                 { col: 'user_id', on: ['select', 'insert'] },
  transactions:             { col: 'user_id', on: ['insert', 'update'] },
  notification_reads:       { col: 'user_id', on: ['select', 'insert', 'update', 'delete'] },
  notification_hidden:      { col: 'user_id', on: ['select', 'insert', 'update', 'delete'] },
  notification_preferences: { col: 'user_id', on: ['select', 'insert', 'update', 'delete'] },
  push_subscriptions:       { col: 'user_id', on: ['select', 'insert', 'update', 'delete'] },
};

const isKaryawan = (req) => req.user?.role === 'karyawan';

function assertPerm(req, table, action) {
  const perms = TABLE_PERMS[table];
  if (!perms || !perms[action]?.includes(req.user?.role)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
}

// updateCols[role]: batasi kolom yang boleh diubah role tsb (role lain bebas).
function assertUpdateCols(req, table, cols) {
  const allowed = TABLE_PERMS[table]?.updateCols?.[req.user?.role];
  if (!allowed) return;
  for (const c of cols) {
    if (!allowed.includes(c)) {
      const err = new Error('Forbidden');
      err.status = 403;
      throw err;
    }
  }
}

function scopeCol(table, action) {
  const s = SCOPE_OWN[table];
  return s && s.on.includes(action) ? s.col : null;
}

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
  return { clauses, params };
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
      assertPerm(req, t, 'select');

      const cols = sanitizeColumns(req.query.select);
      const { clauses, params } = buildWhere(JSON.parse(req.query.filter || '[]'));
      if (scopeCol(t, 'select') && isKaryawan(req)) {
        clauses.push(`${scopeCol(t, 'select')} = $${params.length + 1}`);
        params.push(req.user.sub);
      }
      const whereSql = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
      const { offset, limit } = parseRange(req.query.range);
      const orderClause = buildOrder(req.query.order, req.query.asc);
      const base = `FROM ${t} ${whereSql}`;
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
      assertPerm(req, t, 'insert');

      const body = req.body || {};
      if (scopeCol(t, 'insert') && isKaryawan(req)) {
        body[scopeCol(t, 'insert')] = req.user.sub;
      }
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
      assertPerm(req, t, 'update');

      const body = req.body || {};
      const cols = Object.keys(body).filter((c) => { assertCol(c, 'update col'); return c !== 'id'; });
      if (!cols.length) return res.status(400).json({ error: 'no updatable columns' });
      assertUpdateCols(req, t, cols);

      const values = cols.map((c) => body[c]);
      const params = [...values, req.params.id];
      let idCond = `id = $${params.length}`;
      if (scopeCol(t, 'update') && isKaryawan(req)) {
        params.push(req.user.sub);
        idCond += ` AND ${scopeCol(t, 'update')} = $${params.length}`;
      }
      const setSql = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
      const { rows } = await pool.query(
        `UPDATE ${t} SET ${setSql} WHERE ${idCond} RETURNING *`,
        params
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
      assertPerm(req, t, 'delete');

      let cond = 'id = $1';
      const params = [req.params.id];
      if (scopeCol(t, 'delete') && isKaryawan(req)) {
        params.push(req.user.sub);
        cond += ` AND ${scopeCol(t, 'delete')} = $2`;
      }
      const { rowCount } = await pool.query(`DELETE FROM ${t} WHERE ${cond}`, params);
      if (!rowCount) return res.status(404).json({ error: 'row not found' });
      res.json({ data: { deleted: rowCount } });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}