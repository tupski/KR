# Phase 03 — Web Installer

File target:
- `server/installer/routes.js`, `server/installer/validator.js`, `server/installer/bootstrap.js`
- `server/installer/validator.test.js` (TDD A4)
- `server/installer/state.js` — state machine antar step

---

## 1. Flow states

```
IDLE ──GET /install──▶ DB_FORM ──POST /install/step/db──▶ DB_CHECK (validasi koneksi)
   (belum terpasang)                  │ sukses
                                      ▼
                              MIGRATE_RUN ──▶ MIGRATE_DONE (skema + migrasi + seed)
                                      │
                                      ▼
                              ADMIN_FORM ──▶ ADMIN_CHECK (validasi email/password)
                                      │ sukses
                                      ▼
                              STORAGE_FORM ──▶ STORAGE_CHECK (test koneksi provider)
                                      │ sukses
                                      ▼
                              CONFIG_FORM (base URL, timezone, dsb) ──▶ CONFIRM
                                      │
                                      ▼
                              BOOTSTRAP (tulis .env, config.json, installed.lock) ──▶ DONE
```

Aturan:
- Server yang sudah `installed.lock` → `/install` redirect ke `/` (installer terkunci).
- `POST /install/step/*` butuh CSRF token dari cookie installer (`kr_install`, dibuat saat pertama
  `GET /install`, `HttpOnly`).
- State disimpan server-side (file `install-progress.json` di `server/config/`) + diverifikasi
  urutan; klien hanya menampilkan.

---

## 2. validator.js — validasi koneksi PostgreSQL

```js
// server/installer/validator.js
// Hanya konstruksi DSN aman; tanpa eksekusi SQL berbahaya.
export function parseDsn({ host, port, database, user, password }) {
  const p = Number(port);
  if (!host || !database || !user) throw new Error('host, database, user wajib');
  if (!Number.isInteger(p) || p < 1 || p > 65535) throw new Error('port tidak valid');
  if (password === undefined || password === '') throw new Error('password wajib');
  // nilai password bisa mengandung karakter khusus — pakai pg connection object, bukan string DSN
  return { host, port: p, database, user, password, ssl: false };   // ssl: true opsional untuk VPS
}

export async function testConnection(conn) {
  // 1) buka koneksi sementara, timeout 5s
  // 2) SELECT 1 → pastikan server hidup
  // 3) cek tabel existing: users / schema_migrations (informasional, bukan error)
  // return { ok, hasSchema, serverTime, latencyMs }
  // error → { ok: false, stage: 'connect'|'auth'|'timeout', message }
}

export async function checkSchema(pool) {
  const { rows } = await pool.query(
    `SELECT to_regclass('public.schema_migrations') AS has_migrations,
            to_regclass('public.users')            AS has_users`);
  return { hasSchema: !!(rows[0]?.has_migrations || rows[0]?.has_users) };
}

// Test tanpa mengeksekusi SQL berbahaya: hanya SELECT/read-only introspection.
// Alasan: input admin adalah admin DB sendiri; risiko utama = salah ketik → error dini.
```

TDD A4 mengecek: DSN valid, port non-numerik, password kosong, host kosong, timeout,
dan `hasSchema` benar saat tabel ada vs tidak — dengan pool yang di-mock (tanpa koneksi nyata).

---

## 3. Bootstrap

```js
// server/installer/bootstrap.js
export async function bootstrap({ conn, admin, storage, baseUrl }) {
  // 1) pool = new Pool(conn)
  // 2) await migrate(pool)                      // server/db/migrate.js
  // 3) admin = await createFirstAdmin(pool, admin)   // bcrypt hash, insert users + user_roles
  // 4) seed system_settings: app_name, wa_admin, maintenance_mode, storage_provider, dsb
  // 5) tulis file:
  //    .env:  PG_HOST, PG_PORT, PG_DB, PG_USER, PG_PASSWORD, AUTH_SECRET(64B random),
  //           + secret storage per provider (dari STORAGE_FORM bila mode env)
  //    config/config.json: { baseUrl, timezone:'Asia/Jakarta', storage:{ provider, bucket, endpoint, region } }
  //    config/installed.lock: { installedAt, version }
  // 6) hapus install-progress.json
  // return { ok, baseUrl }
}

export function generateSecret(bytes = 64) {
  return crypto.randomBytes(bytes).toString('hex');
}

export async function createFirstAdmin(pool, { email, password, fullName }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('email tidak valid');
  if (!password || password.length < 8) throw new Error('password minimal 8 karakter');
  const hash = await hashPassword(password);
  await pool.query('BEGIN');
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,$3) RETURNING id`, ...);
  await pool.query(`INSERT INTO user_roles (user_id, role) VALUES ($1,'super_admin')`, [rows[0].id]);
  await pool.query('COMMIT');
  return rows[0].id;
}
```

---

## 4. Routes

```js
// server/installer/routes.js — mount hanya bila !installed
router.get('/install', (req, res) => {
  if (isInstalled()) return res.redirect('/');
  res.cookie('kr_install', csrf, { httpOnly: true, sameSite: 'strict' });
  res.sendFile(INSTALLER_HTML);        // static — SPA kecil tanpa React build
});

// setiap POST cek urutan state + csrf
router.post('/install/step/db', async (req, res) => {
  try {
    const conn = parseDsn(req.body);                       // throw → 400 { error }
    const result = await testConnection(conn);             // mockable di test
    if (!result.ok) return res.status(400).json(result);   // stage + message jelas
    state.set('DB_CHECK', { conn, ...result });
    res.json({ next: 'MIGRATE_RUN', ...result });
  } catch (e) { res.status(400).json({ ok: false, message: e.message }); }
});

router.post('/install/step/admin', async (req, res) => {
  // validasi email/password format; hash dilakukan saat BOOTSTRAP
  state.set('ADMIN_CHECK', req.body);
  res.json({ next: 'STORAGE_FORM' });
});

router.post('/install/step/storage', async (req, res) => {
  const { provider, config, secrets } = req.body;          // secrets opsional (mode env)
  const adapter = getStorageAdapter({ provider, config, env: { ...process.env, ...secrets } });
  const ping = await adapter.ping();                       // gagal → 400, tampilkan detail
  if (!ping.ok) return res.status(400).json(ping);
  state.set('STORAGE_CHECK', { provider, config, secrets });
  res.json({ next: 'CONFIG_FORM' });
});

router.post('/install/step/confirm', async (req, res) => {
  const all = state.getAll();                              // gabung DB_CHECK+ADMIN+STORAGE+CONFIG
  const result = await bootstrap(all);                     // tulis .env, config, lock
  res.clearCookie('kr_install');
  res.json({ ok: true, baseUrl: result.baseUrl });         // klien redirect ke /login
});
```

---

## 5. TDD Anchor

### A4 — `server/installer/validator.test.js`
```js
// stub db pool — tanpa koneksi nyata
it('parseDsn: valid', () => {
  const c = parseDsn({ host:'127.0.0.1', port:'5432', database:'kr', user:'kr', password:'x' });
  expect(c.port).toBe(5432);
});
it('parseDsn: port non-numerik → throw', () => {
  expect(() => parseDsn({ host:'h', port:'abc', database:'d', user:'u', password:'p' })).toThrow(/port/);
});
it('parseDsn: password kosong → throw', () => {
  expect(() => parseDsn({ host:'h', port:'5432', database:'d', user:'u', password:'' })).toThrow(/password/);
});
it('testConnection: pool mock connect gagal → { ok:false, stage:"connect" }', async () => {
  const pool = { query: vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')) };
  const r = await testConnection(pool, 5000);
  expect(r.ok).toBe(false); expect(r.stage).toBe('connect');
});
it('checkSchema: to_regclass ada → hasSchema true', async () => {
  const pool = { query: vi.fn().mockResolvedValue({ rows: [{ has_migrations: 'schema_migrations', has_users: null }] }) };
  expect((await checkSchema(pool)).hasSchema).toBe(true);
});
it('createFirstAdmin: email invalid → throw; password pendek → throw', async () => { ... });
```

Skenario tambahan: DSN dengan password mengandung `@`/`/` tidak rusak (connection object, bukan string DSN).
