// Installer bootstrap: create first super_admin, write .env / config.json / installed.lock.
// K4: non-secret → config.json; secrets → .env only. AES-encrypted-secret mode: ponytail: add when env editing impossible on target host.
import { randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { hashPassword } from '../auth.js';

export const generateSecret = (bytes = 64) => randomBytes(bytes).toString('hex');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createFirstAdmin(pool, { email, password, fullName }, deps = {}) {
  const hash = deps.hashPassword || hashPassword;
  if (!EMAIL_RE.test(email)) throw new Error('email tidak valid');
  if (!password || password.length < 8) throw new Error('password minimal 8 karakter');
  const passwordHash = await hash(password);
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id`,
      [email.toLowerCase(), passwordHash, fullName || null]
    );
    const userId = rows[0].id;
    await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'super_admin')`, [userId]);
    await client.query('COMMIT');
    return userId;
  } catch (e) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* connection already dead */ }
    }
    if (/duplicate|unique/i.test(e.message)) {
      throw new Error('email sudah terdaftar');
    }
    throw e;
  } finally {
    client?.release();
  }
}

/**
 * bootstrap({ dir, conn, admin, storage }) → { ok, baseUrl }
 * - dir: server working dir (created if missing) holding .env, config.json, installed.lock
 * - conn: pg connection object from parseDsn
 * - baseUrl: public URL (non-secret → config.json)
 * - migrateFn: injectable runner (default real migrate)
 */
export async function bootstrap({
  dir,
  conn,
  admin,
  storage = {},
  baseUrl = '',
  migrateFn,
  Pool,
}) {
  await mkdir(dir, { recursive: true });
  const PgPool = Pool || (await import('pg')).default.Pool;
  const pool = new PgPool(conn);
  try {
    const runMigrate = migrateFn || (await import('../migrate.js')).migrate;
    await runMigrate(pool);
    await createFirstAdmin(pool, admin);

    const secretFile = {
      DATABASE_URL: `postgres://${encodeURIComponent(conn.user)}:${encodeURIComponent(conn.password)}@${conn.host}:${conn.port}/${conn.database}`,
      JWT_SECRET: generateSecret(64),
    };
    // provider secrets, bila diset (mode env K4)
    for (const [k, v] of Object.entries(storage.secrets || {})) {
      if (v) secretFile[k] = v;
    }
    await writeFile(path.join(dir, '.env'), formatEnv(secretFile), { flag: 'wx' });

    const config = {
      baseUrl,
      timezone: 'Asia/Jakarta',
      storage: {
        provider: storage.provider || 'r2',
        ...(storage.nonSecret || {}),
      },
      installedAt: new Date().toISOString(),
      version: 'self-host',
    };
    await writeFile(path.join(dir, 'config.json'), JSON.stringify(config, null, 2));
    await writeFile(path.join(dir, 'installed.lock'), JSON.stringify({ installedAt: config.installedAt, version: 'self-host' }, null, 2));

    return { ok: true, baseUrl };
  } finally {
    await pool.end();
  }
}

function formatEnv(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${quoteEnv(v)}`)
    .join('\n') + '\n';
}

function quoteEnv(v) {
  const s = String(v);
  return /[\s#]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}