// Installer routes: multi-step setup before first login. NOT auth-guarded (pre-user).
// State machine per spec phase_03: DB_FORM → MIGRATE_DONE → ADMIN_CHECK → STORAGE_CHECK → finished.
// GUARD: any POST 403 once installed.lock exists. Secrets never in response; env-only (K4).
// M3: progress persisted ke install-progress.json di configDir; M4: /status hanya { installed }.
import { Router } from 'express';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { parseDsn, testConnection } from '../installer/validator.js';
import { bootstrap } from '../installer/bootstrap.js';

const PROVIDERS = ['r2', 'vercel_blob', 'supabase'];
const NON_SECRET_REQUIRED = {
  r2: ['bucket', 'endpoint'],
  vercel_blob: [],
  supabase: ['bucket'],
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;

export default function installRoutes({ configDir, migrateFn, dbModule } = {}) {
  const router = Router();
  const dir = configDir || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'config');
  const lockFile = path.join(dir, 'installed.lock');
  const progressFile = path.join(dir, 'install-progress.json');
  const Pool = dbModule?.Pool || dbModule || pg.Pool;

  const readState = () => {
    try { return JSON.parse(readFileSync(progressFile, 'utf8')); } catch { return {}; }
  };
  const writeState = (state) => {
    try { writeFileSync(progressFile, JSON.stringify(state, null, 2)); } catch (e) { console.error('progress write failed:', e.message); }
  };

  const isInstalled = () => existsSync(lockFile);
  const rejectIfInstalled = (_req, res, next) =>
    isInstalled() ? res.status(403).json({ error: 'Sudah terpasang' }) : next();

  // M4: tanpa progress leak; cukup { installed }.
  router.get('/status', (_req, res) => {
    res.json({ installed: isInstalled() });
  });

  router.post('/step/db', rejectIfInstalled, async (req, res) => {
    try {
      const body = req.body || {};
      const conn = body.databaseUrl ? fromUrl(body.databaseUrl) : parseDsn(body);
      const pool = new Pool(conn);
      const result = await testConnection(pool, 5000);
      if (!result.ok) return res.status(400).json(result);
      writeState({ db: { conn, ...result } });
      res.json({ ok: true, next: 'migrate', ...result });
    } catch (e) {
      res.status(400).json({ ok: false, message: e.message });
    }
  });

  router.post('/step/migrate', rejectIfInstalled, async (req, res) => {
    const state = readState();
    if (!state.db?.conn) return res.status(400).json({ ok: false, message: 'step db dulu' });
    try {
      const pool = new Pool(state.db.conn);
      const run = migrateFn || (await import('../migrate.js')).migrate;
      const result = await run(pool);
      await pool.end();
      writeState({ ...state, migrated: true });
      res.json({ ok: true, next: 'admin', applied: result.applied });
    } catch (e) {
      res.status(400).json({ ok: false, message: e.message });
    }
  });

  // Validasi saja (K4): password TIDAK disimpan di install-progress.json.
  // Admin dibuat sekali di bootstrap (/finish) — hash terjadi di sana.
  router.post('/step/admin', rejectIfInstalled, async (req, res) => {
    const state = readState();
    if (!state.migrated) return res.status(400).json({ ok: false, message: 'step migrate dulu' });
    try {
      const { email, password, fullName } = req.body || {};
      if (!EMAIL_RE.test(String(email || ''))) return res.status(400).json({ ok: false, message: 'email tidak valid' });
      if (!password || String(password).length < MIN_PASSWORD_LEN) {
        return res.status(400).json({ ok: false, message: 'password minimal 8 karakter' });
      }
      writeState({ ...state, admin: { email: String(email).toLowerCase(), fullName: fullName || null } });
      res.json({ ok: true, next: 'storage' });
    } catch (e) {
      res.status(400).json({ ok: false, message: e.message });
    }
  });

  router.post('/step/storage', rejectIfInstalled, async (req, res) => {
    const state = readState();
    if (!state.admin) return res.status(400).json({ ok: false, message: 'step admin dulu' });
    try {
      const { provider, config = {} } = req.body || {};
      if (!PROVIDERS.includes(provider)) throw new Error('provider tidak dikenal');
      for (const k of NON_SECRET_REQUIRED[provider]) {
        if (!config[k]) throw new Error(`field '${k}' wajib untuk ${provider}`);
      }
      writeState({ ...state, storage: { provider, nonSecret: config } });
      res.json({ ok: true, next: 'finish', provider });
    } catch (e) {
      res.status(400).json({ ok: false, message: e.message });
    }
  });

  router.post('/finish', rejectIfInstalled, async (req, res) => {
    const state = readState();
    if (!state.db?.conn || !state.migrated || !state.admin || !state.storage) {
      return res.status(400).json({ ok: false, message: 'semua step belum selesai' });
    }
    try {
      const baseUrl = req.body?.baseUrl || '';
      // Password admin dipegang klien antar step (tidak pernah disimpan di server),
      // dikirim ulang saat finalisasi untuk pembuatan akun di bootstrap.
      const adminPassword = req.body?.adminPassword;
      if (!adminPassword || String(adminPassword).length < MIN_PASSWORD_LEN) {
        return res.status(400).json({ ok: false, message: 'password admin dibutuhkan untuk finalisasi' });
      }
      const result = await bootstrap({
        dir,
        conn: state.db.conn,
        admin: { ...state.admin, password: adminPassword },
        storage: state.storage,
        baseUrl,
        migrateFn,
        Pool,
      });
      // K4/cleanup: buang install-progress.json (berisi DB password + email admin)
      // setelah instalasi sukses — spec phase_03 step 6.
      try { await rm(progressFile, { force: true }); } catch { /* non-fatal: lock sudah terkunci */ }
      res.json({ ok: true, redirectUrl: '/', ...result });
    } catch (e) {
      res.status(400).json({ ok: false, message: e.message });
    }
  });

  return router;
}

function fromUrl(databaseUrl) {
  let u;
  try {
    u = new URL(databaseUrl);
  } catch {
    throw new Error('databaseUrl tidak valid');
  }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') throw new Error('bukan URL postgres');
  // L3: ?sslmode=require → ssl on; default false untuk kompatibilitas.
  const ssl = u.searchParams.get('sslmode') === 'require';
  return {
    host: u.hostname,
    port: Number(u.port) || 5432,
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl: ssl ? { rejectUnauthorized: false } : false,
  };
}