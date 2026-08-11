# Phase 02 — Backend Core: Auth, DB CRUD, RPC Bridge, Changes, Migrasi

File target:
- `server/auth/password.js`, `server/auth/jwt.js`, `server/auth/middleware.js`, `server/auth/routes.js`
- `server/api/dbRoutes.js`, `server/api/rpcBridge.js`, `server/api/changes.js`, `server/api/settings.js`
- `server/db/pool.js`, `server/db/migrate.js`
- `server/auth/auth.test.js` (TDD A3)

---

## 1. Auth

### password.js
```js
// server/auth/password.js
import bcrypt from 'bcryptjs';          // murni JS — tanpa native build (N6)

const COST = 12;
export const hashPassword   = (plain) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);
```

### jwt.js
```js
// server/auth/jwt.js
import jwt from 'jsonwebtoken';        // atau implementasi minimal sendiri

export const signToken = ({ userId, role }, secret, ttl = '7d') =>
  jwt.sign({ sub: userId, role }, secret, { expiresIn: ttl });

export const verifyToken = (token, secret) => jwt.verify(token, secret);
```

### middleware.js
```js
// server/auth/middleware.js
// Cookie: kr_session (httpOnly, SameSite=Strict, Secure bila https, path=/)
// CSRF: header X-Requested-With wajib untuk mutasi (bukan GET)
export function requireAuth(req, res, next) {
  const token = req.cookies.kr_session;                 // atau Authorization: Bearer
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = verifyToken(token, process.env.AUTH_SECRET);
    return next();
  } catch { return res.status(401).json({ error: 'Session expired' }); }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user?.role || !roles.includes(req.user.role))
      return res.status(403).json({ error: 'Forbidden' });
    return next();
  };
}

export function csrfGuard(req, res, next) {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest')
    return res.status(403).json({ error: 'CSRF' });
  return next();
}
```

Role hierarchy (dari `user_roles`): `super_admin` > `admin` > `karyawan`.
`requireRole` dipanggil dengan role eksplisit; helper `isAdmin(req)` untuk cek `admin|super_admin`.

### routes.js — `POST /api/v1/auth/*`
```js
// server/auth/routes.js
router.post('/login', rateLimit(5, 15), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email & password wajib' });

  const user = await db.one('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!user || !(await verifyPassword(password, user.password_hash)))
    return res.status(401).json({ error: 'Email atau password salah' });

  const role = await db.one('SELECT role FROM user_roles WHERE user_id = $1', [user.id])
                .then(r => r?.role).catch(() => null);

  const token = signToken({ userId: user.id, role: role || 'karyawan' }, process.env.AUTH_SECRET);
  res.cookie('kr_session', token, cookieOpts(req));
  res.json({ user: publicUser(user, role) });
});

router.post('/logout', requireAuth, (_req, res) => {
  res.clearCookie('kr_session', cookieOpts(req));      // + optional blacklist (ponytail: add when revoke dibutuhkan)
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await db.one('SELECT * FROM users WHERE id = $1', [req.user.sub]);
  const role = await db.one('SELECT role FROM user_roles WHERE user_id = $1', [req.user.sub]);
  res.json({ user: publicUser(user, role?.role) });
});

// register/update/delete user → delegasi ke dbRoutes/admin-role RPC (lihat §2.3)
// change_password: verify old → update hash
```

`publicUser` menghapus `password_hash`. Email unik enforced oleh constraint `users.email_unique`.

---

## 2. DB CRUD + RPC Bridge

### 2.1 dbRoutes.js — CRUD generik
```js
// server/api/dbRoutes.js
// Tabel yang diizinkan (whitelist) — dari daftar tabel migrasi:
const ALLOWED_TABLES = new Set([
  'transactions','pengeluaran','tagihan_bulanan','tagihan_fee_lunas','tagihan_fee_lunas_items',
  'marketing_list','karyawan_list','lokasi_apartemen','nomor_kamar','user_profiles','user_roles',
  'user_location_assignments','notifications','notification_reads','notification_hidden',
  'notification_preferences','push_subscriptions','requests','pengeluaran_categories',
  'activity_logs','system_settings','role_menu_visibility','recurring_unit_bills',
]);

// GET /api/v1/db/:table
// Query params:
//   select=col1,col2          (default '*')
//   filter=<json>             [{ col, op: 'eq'|'gte'|'lt'|'in'|'is'|'or', value }]
//   order=col&asc=false
//   range=offset,limit        (wajib untuk tabel besar — AGENTS.md)
//   count=exact|head
router.get('/db/:table', requireAuth, async (req, res) => {
  const t = req.params.table;
  if (!ALLOWED_TABLES.has(t)) return res.status(400).json({ error: `tabel ${t} tidak diizinkan` });

  const { where, params } = buildWhere(parseFilter(req.query.filter));   // prepared statements
  const cols = sanitizeColumns(req.query.select);
  const { offset = 0, limit = 50 } = parseRange(req.query.range);        // default 50, max 200
  const orderClause = buildOrder(req.query.order, req.query.asc);

  const { rows, count } = req.query.count === 'exact'
    ? await db.query(`SELECT ${cols} FROM ${t} ${where} ${orderClause} LIMIT $n OFFSET $m`, params)
    : await db.query(`SELECT ${cols} FROM ${t} ${where} ${orderClause} LIMIT $n OFFSET $m`, params);

  res.json({ data: rows, totalCount: count });
});
```

- `buildWhere` menerjemahkan `{col, op, value}` → fragment SQL parameterized. Op `or` menerima array kondisi.
- **Tanpa interpolasi string user** untuk kolom/tabel — `sanitizeColumns` hanya izinkan `[a-zA-Z0-9_,]`, tabel dari whitelist.
- `count: 'exact'` → jalankan `SELECT count(*)` terpisah (dua query), `head` → tanpa body.

### 2.2 rpcBridge.js — `POST /api/v1/rpc/:name`
```js
// server/api/rpcBridge.js
// Whitelist RPC — nama dari migrasi Supabase (hanya fungsi yang aman untuk direct call):
const ALLOWED_RPC = new Set([
  'get_category_summary','get_monthly_revenue_trend','get_revenue_yoy_comparison',
  'get_outstanding_bills_summary','get_dashboard_kpis','get_location_fullness',
  'get_repeat_guests','pay_fee_items','pay_tagihan_bulanan','delete_transaction_cascade',
  'log_activity','admin_update_user','admin_create_user','admin_delete_user',
  // ... + semua fungsi public.* di supabase/migrations
]);

router.post('/rpc/:name', requireAuth, async (req, res) => {
  const name = req.params.name;
  if (!ALLOWED_RPC.has(name)) return res.status(400).json({ error: `rpc ${name} tidak diizinkan` });

  const params = req.body || {};
  // p_limit/p_offset diterjemahkan untuk RPC paginated
  const { rows, error } = await db.func(name, params);   // SELECT * FROM name(...)
  if (error) return res.status(400).json({ error: error.message });

  res.json({ data: rows, totalCount: rows?.[0]?.total_count ?? rows?.length ?? 0 });
});
```

`db.func` memanggil fungsi dengan argumen bernama, memetakan parameter JSON → tipe SQL
(`bigint[]` → array number, `date` → string, `uuid` → string). Nama fungsi diverifikasi terhadap
`pg_proc` saat boot (fail-fast bila fungsi hilang).

### 2.3 RPC yang butuh penanganan khusus (adaptasi auth)
Fungsi Supabase memakai `auth.uid()` / `SECURITY DEFINER` / `auth.role()`:
- **`auth.uid()`** → argumen `p_user_id` eksplisit dikirim dari middleware (`req.user.sub`).
- **`SECURITY DEFINER` + RLS** → hapus; keamanan via `requireRole` di route.
- **`auth.users` join** (`user_profiles`, `user_management`) → ganti join ke tabel lokal `users`.

Daftar fungsi terdampak (cek saat migrasi manual): `pay_fee_items`, `pay_tagihan_bulanan`,
`delete_transaction_cascade`, `log_activity`, `admin_*`, `get_*_summary` bila memakai `auth.uid()`.

### 2.4 settings.js — `system_settings`
```js
// server/api/settings.js
// GET /api/v1/settings        (authenticated)   → semua key, value non-secret
// PATCH /api/v1/settings      (requireRole('admin','super_admin'))
//   body: { key: value }      → upsert
// Secret keys (storage_*) ditolak dari klien bila K4 mode DB terenkripsi mati.
// Key yang hanya bisa ditulis server: storage_secrets (lihat K4 opsional).
```

---

## 3. Changes (realtime polling)

```js
// server/api/changes.js
// GET /api/v1/changes?since=<ISO>&tables=transactions,notifications,requests,user_roles
router.get('/changes', requireAuth, async (req, res) => {
  const since = new Date(req.query.since || '1970-01-01');
  const tables = (req.query.tables || '').split(',').filter(t => WATCHED.has(t));

  const perTable = await Promise.all(tables.map(async (t) => {
    // watermark per row: kolom created_at/updated_at > since
    const { rows } = await db.query(
      `SELECT * FROM ${t}
       WHERE COALESCE(updated_at, created_at, NOW()) > $1
       ORDER BY COALESCE(updated_at, created_at, NOW()) ASC LIMIT 500`,
      [since.toISOString()]
    );
    return { table: t, rows };
  }));
  res.json({ changes: perTable, serverTime: new Date().toISOString() });
});
```

Klien: interval 15s saat tab aktif (via `usePageVisibility` — sudah ada di repo), 60s saat idle;
kirim `since = last serverTime`. Tabel `WATCHED` whitelist: `transactions, requests, notifications,
notification_reads, notification_hidden, user_roles, system_settings, push_subscriptions`.

`ponytail:` upgrade ke SSE (`EventSource`) bila polling dirasa lambat — antarmuka `changes` sama,
hanya transport berubah.

---

## 4. Migrasi (server/db/migrate.js)

```js
// server/db/migrate.js
const MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations');

export async function migrate(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  const applied = new Set((await pool.query('SELECT version FROM schema_migrations')).rows.map(r => r.version));
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw new Error(`migrasi ${file} gagal: ${e.message}`); }
    finally { client.release(); }
  }
}
```

### Adaptasi SQL (migrasi manual, per file)
- Ganti `auth.uid()` → parameter; `auth.role()`/`auth.jwt()` → hapus (role via middleware).
- Hapus `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `CREATE POLICY`.
- `auth.users` join → `users` lokal.
- `gen_random_uuid()` → `extensions: CREATE EXTENSION IF NOT EXISTS pgcrypto` di migrasi 001.
- `timezone('utc'::text, NOW())` → `NOW() AT TIME ZONE 'utc'` (bisa dipertahankan — Postgres murni OK).
- Tambah migrasi 000 `_bootstrap.sql`: ekstensi `pgcrypto`, tabel `users`, `user_roles` (seeded role), `schema_migrations`.
- RPC `CREATE OR REPLACE FUNCTION public.fn(...) RETURNS ... SECURITY DEFINER` → hapus `SECURITY DEFINER`, tambah argumen `p_user_id UUID DEFAULT NULL` bila perlu.

Contoh daftar per-file adaptasi: catat di `server/db/migrations/ADAPTATION-NOTES.md` saat implementasi.

---

## 5. TDD Anchor

### A3 — `server/auth/auth.test.js`
```js
import { hashPassword, verifyPassword } from './password.js';
import { signToken, verifyToken } from './jwt.js';

it('hash/verify: hash unik per input, verify true hanya untuk plaintext benar', async () => {
  const h1 = await hashPassword('rahasia123');
  const h2 = await hashPassword('rahasia123');
  expect(h1).not.toBe(h2);                       // salted
  expect(await verifyPassword('rahasia123', h1)).toBe(true);
  expect(await verifyPassword('salah', h1)).toBe(false);
});

it('jwt: token valid berisi sub+role; token tamper → reject', () => {
  const token = signToken({ userId: 'u1', role: 'admin' }, 'secret-32chars-abcdefgh');
  expect(verifyToken(token, 'secret-32chars-abcdefgh').role).toBe('admin');
  const tampered = token.slice(0, -4) + 'XXXX';
  expect(() => verifyToken(tampered, 'secret-32chars-abcdefgh')).toThrow();
});
```

Skenario route (integration, opsional): login salah password → 401; login benar → cookie
`kr_session` set + `{ user }` tanpa `password_hash`; `requireRole('super_admin')` menolak role
`karyawan` → 403.
