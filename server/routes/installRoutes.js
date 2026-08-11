// Installer routes: multi-step setup before first login. NOT auth-guarded (pre-user).
// State machine per spec phase_03: DB_FORM → MIGRATE_DONE → ADMIN_CHECK → STORAGE_CHECK → finished.
// GUARD: any POST 403 once installed.lock exists. Secrets never in response; env-only (K4).
import { Router } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { parseDsn, testConnection } from '../installer/validator.js';
import { bootstrap, createFirstAdmin } from '../installer/bootstrap.js';

const PROVIDERS = ['r2', 'vercel_blob', 'supabase'];
const NON_SECRET_REQUIRED = {
  r2: ['bucket', 'endpoint'],
  vercel_blob: [],
  supabase: ['bucket'],
};

export default function installRoutes({ configDir, migrateFn, dbModule } = {}) {
  const router = Router();
  const dir = configDir || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'config');
  const lockFile = path.join(dir, 'installed.lock');
  const Pool = dbModule?.Pool || dbModule || pg.Pool;

  // in-memory install state (single process, pre-login)
  const state = {};

  const isInstalled = () => existsSync(lockFile);
  const rejectIfInstalled = (_req, res, next) =>
    isInstalled() ? res.status(403).json({ error: 'Sudah terpasang' }) : next();

  router.get('/status', (_req, res) => {
    res.json({ installed: isInstalled(), progress: Object.keys(state) });
  });

  router.post('/step/db', rejectIfInstalled, async (req, res) => {
    try {
      const body = req.body || {};
      const conn = body.databaseUrl ? fromUrl(body.databaseUrl) : parseDsn(body);
      const pool = new Pool(conn);
      const result = await testConnection(pool, 5000);
      if (!result.ok) return res.status(400).json(result);
      state.db = { conn, ...result };
      res.json({ ok: true, next: 'migrate', ...result });
    } catch (e) {
      res.status(400).json({ ok: false, message: e.message });
    }
  });

  router.post('/step/migrate', rejectIfInstalled, async (req, res) => {
    if (!state.db?.conn) return res.status(400).json({ ok: false, message: 'step db dulu' });
    try {
      const pool = new Pool(state.db.conn);
      const run = migrateFn || (await import('../migrate.js')).migrate;
      const result = await run(pool);
      await pool.end();
      state.migrated = true;
      res.json({ ok: true, next: 'admin', applied: result.applied });
    } catch (e) {
      res.status(400).json({ ok: false, message: e.message });
    }
  });

  router.post('/step/admin', rejectIfInstalled, async (req, res) => {
    if (!state.migrated) return res.status(400).json({ ok: false, message: 'step migrate dulu' });
    try {
      const { email, password, fullName } = req.body || {};
      const pool = new Pool(state.db.conn);
      await createFirstAdmin(pool, { email, password, fullName });
      await pool.end();
      state.admin = { email, password, fullName, userId: 'created' };
      res.json({ ok: true, next: 'storage' });
    } catch (e) {
      res.status(400).json({ ok: false, message: e.message });
    }
  });

  router.post('/step/storage', rejectIfInstalled, async (req, res) => {
    if (!state.admin) return res.status(400).json({ ok: false, message: 'step admin dulu' });
    try {
      const { provider, config = {} } = req.body || {};
      if (!PROVIDERS.includes(provider)) throw new Error('provider tidak dikenal');
      for (const k of NON_SECRET_REQUIRED[provider]) {
        if (!config[k]) throw new Error(`field '${k}' wajib untuk ${provider}`);
      }
      state.storage = { provider, nonSecret: config };
      res.json({ ok: true, next: 'finish', provider });
    } catch (e) {
      res.status(400).json({ ok: false, message: e.message });
    }
  });

  router.post('/finish', rejectIfInstalled, async (req, res) => {
    if (!state.db?.conn || !state.migrated || !state.admin || !state.storage) {
      return res.status(400).json({ ok: false, message: 'semua step belum selesai' });
    }
    try {
      const baseUrl = req.body?.baseUrl || '';
      const result = await bootstrap({
        dir,
        conn: state.db.conn,
        admin: state.admin,
        storage: state.storage,
        baseUrl,
        migrateFn,
        Pool,
      });
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
  return {
    host: u.hostname,
    port: Number(u.port) || 5432,
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl: false,
  };
}