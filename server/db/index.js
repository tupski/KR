/* eslint-env node */
/* global process */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString: connectionString || undefined,
  max: Number(process.env.PG_MAX_CONNECTIONS || 20),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('[DB EXEC]', { text, duration, rows: res.rowCount });
  }
  return res;
}

/**
 * Execute `fn(client)` inside a single transaction that also sets the
 * `request.jwt.*` GUCs (auth.uid()/auth.role()/auth.jwt() compatibility shims
 * from prepare-target.sql) to the verified actor. Postgres RLS policies,
 * SECURITY DEFINER RPCs and helper functions (is_super_admin(), log_activity(),
 * admin_* RPCs, ...) call auth.uid() internally — without these GUCs they see
 * NULL and deny every request even for a real super_admin.
 *
 * set_config(..., true) = is_local: the values are scoped to THIS transaction
 * and auto-reset on commit/rollback, so a pooled connection never leaks one
 * actor's identity into another request.
 */
export async function runAsActor(actor, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sub = String(actor?.userId || '');
    const role = String(actor?.role || '');
    const email = String(actor?.email || '');
    if (sub) {
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [sub]);
      await client.query("SELECT set_config('request.jwt.claim.role', $1, true)", [role]);
      await client.query(
        "SELECT set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub, role, email })]
      );
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDbHealth() {
  try {
    const res = await pool.query('SELECT 1 as healthy');
    return res.rows[0]?.healthy === 1;
  } catch (_e) {
    return false;
  }
}

export async function closePool() {
  await pool.end().catch(() => {});
}
