// Installer PG validator: DSN safety + connection test + schema introspection.
// Read-only queries only; no destructive SQL. See docs/self-host/phase_03_installer.md §2.
export function parseDsn({ host, port, database, user, password }) {
  if (!host || !database || !user) throw new Error('host, database, user wajib');
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) throw new Error('port tidak valid');
  if (password === undefined || password === '') throw new Error('password wajib');
  // connection object (bukan string DSN) supaya password berkarakter khusus aman
  return { host, port: p, database, user, password, ssl: false };
}

export async function testConnection(pool, timeoutMs = 5000) {
  const started = Date.now();
  let client;
  let timer;
  try {
    client = await Promise.race([
      pool.connect(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
    clearTimeout(timer);
    const t = (sql) =>
      Promise.race([
        client.query(sql),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
        }),
      ]);
    const pong = await t('SELECT 1 AS ok');
    clearTimeout(timer);
    const schema = await t(
      `SELECT to_regclass('public.schema_migrations') AS has_migrations,
              to_regclass('public.users')            AS has_users`
    );
    clearTimeout(timer);
    return {
      ok: true,
      hasSchema: !!(schema.rows[0]?.has_migrations || schema.rows[0]?.has_users),
      serverTime: pong.rows[0]?.ok,
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    const stage = e.message === 'timeout' ? 'timeout' : /password|authenticat/i.test(e.message) ? 'auth' : 'connect';
    return { ok: false, stage, message: e.message };
  } finally {
    clearTimeout(timer);
    if (client) client.release();
  }
}

export async function checkSchema(pool) {
  const { rows } = await pool.query(
    `SELECT to_regclass('public.schema_migrations') AS has_migrations,
            to_regclass('public.users')            AS has_users`
  );
  return { hasSchema: !!(rows[0]?.has_migrations || rows[0]?.has_users) };
}