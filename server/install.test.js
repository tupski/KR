// @vitest-environment node
// A4 installer: full flow via real HTTP + fake pg pool + real fs (temp dir). No real DB.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from './index.js';
import { loadConfig } from './config.js';

// ---- fake pg module -------------------------------------------------------
function makeFakePg() {
  const query = vi.fn();
  const client = { query, release: vi.fn() };
  const pool = {
    query,
    connect: vi.fn(async () => client),
    end: vi.fn(async () => {}),
  };
  const Pg = vi.fn(() => pool);
  return { Pg, pool, query, client };
}
const fakePg = makeFakePg();
const fakeMigrate = vi.fn(async () => ({ applied: ['001_core.sql'] }));

const cfg = loadConfig({
  PORT: '3000',
  DATABASE_URL: 'postgres://x:x@localhost:1/x',
  JWT_SECRET: 'secret-32chars-abcdefghijklmnopqrstuvwxyz',
  COOKIE_SECURE: 'false',
});

let dir;
beforeEach(async () => {
  fakePg.pool.query.mockReset();
  fakePg.pool.connect.mockReset().mockImplementation(async () => fakePg.client);
  fakeMigrate.mockClear();
  dir = await mkdtemp(path.join(tmpdir(), 'kr-install-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function buildApp() {
  return createApp({
    cfg,
    pool: {},
    install: { configDir: dir, dbModule: fakePg.Pg, migrateFn: fakeMigrate },
  });
}

async function request(app, method, url, body) {
  const server = app.listen(0);
  const port = server.address().port;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 4000);
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      signal: ac.signal,
      headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
    await new Promise((r) => server.close(r));
  }
}

const goodConn = { host: '127.0.0.1', port: 5432, database: 'kr', user: 'kr', password: 'x@/y' };

describe('A4 installer routes', () => {
  it('status badge: belum install → installed:false', async () => {
    const res = await request(buildApp(), 'GET', '/api/install/status');
    expect(res.status).toBe(200);
    expect(res.json.installed).toBe(false);
  });

  it('step/db koneksi gagal → 400 error rapi, state tidak maju', async () => {
    fakePg.query.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const app = buildApp();
    const res = await request(app, 'POST', '/api/install/step/db', { ...goodConn });
    expect(res.status).toBe(400);
    expect(res.json.ok).toBe(false);
    expect(res.json.stage).toBe('connect');
    // state tidak maju: migrate masih ditolak (butuh db dulu)
    const m = await request(app, 'POST', '/api/install/step/migrate');
    expect(m.status).toBe(400);
  });

  it('step/db ok → hasSchema; step/migrate jalankan migrasi', async () => {
    fakePg.query
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] })                      // SELECT 1
      .mockResolvedValueOnce({ rows: [{ has_migrations: null, has_users: 'users' }] }); // introspection
    const app = buildApp();
    const db = await request(app, 'POST', '/api/install/step/db', { ...goodConn });
    expect(db.status).toBe(200);
    expect(db.json.ok).toBe(true);
    expect(db.json.hasSchema).toBe(true);
    const m = await request(app, 'POST', '/api/install/step/migrate');
    expect(m.status).toBe(200);
    expect(m.json.ok).toBe(true);
    expect(fakeMigrate).toHaveBeenCalledTimes(1);
  });

  it('step/admin create super_admin pertama (bcrypt, users + user_roles)', async () => {
    fakePg.query
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] })
      .mockResolvedValueOnce({ rows: [{ has_migrations: null, has_users: null }] });
    const app = buildApp();
    await request(app, 'POST', '/api/install/step/db', { ...goodConn });
    await request(app, 'POST', '/api/install/step/migrate');

    fakePg.pool.connect.mockClear();
    fakePg.query.mockReset();
    fakePg.query
      .mockResolvedValueOnce({ rows: [] })                       // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'u1' }] })           // INSERT users RETURNING id
      .mockResolvedValueOnce({ rows: [] })                       // INSERT user_roles
      .mockResolvedValueOnce({ rows: [] });                      // COMMIT
    const res = await request(app, 'POST', '/api/install/step/admin', {
      email: 'admin@kr.local', password: 'rahasia123', fullName: 'Admin KR',
    });
    expect(res.status).toBe(200);
    expect(res.json.next).toBe('storage');
    const calls = fakePg.query.mock.calls;
    expect(calls[0][0]).toBe('BEGIN');
    expect(calls[1][0]).toContain('INSERT INTO users');
    expect(calls[1][1][0].toLowerCase()).toBe('admin@kr.local');
    expect(calls[2][0]).toContain('INSERT INTO user_roles');
    expect(calls[3][0]).toBe('COMMIT');
    // bcrypt hash tersimpan bukan plain
    expect(calls[1][1][1]).not.toBe('rahasia123');
  });

  it('step/admin email duplikat → 400 rapi', async () => {
    fakePg.query
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] })
      .mockResolvedValueOnce({ rows: [{ has_migrations: null, has_users: null }] });
    const app = buildApp();
    await request(app, 'POST', '/api/install/step/db', { ...goodConn });
    await request(app, 'POST', '/api/install/step/migrate');
    fakePg.query.mockReset();
    const err = new Error('duplicate key value violates unique constraint "users_email_key"');
    fakePg.pool.connect.mockReset();
    fakePg.pool.connect.mockRejectedValueOnce(err);
    const res = await request(app, 'POST', '/api/install/step/admin', {
      email: 'admin@kr.local', password: 'rahasia123',
    });
    expect(res.status).toBe(400);
    expect(res.json.message).toMatch(/sudah terdaftar|duplicate/i);
  });

  it('flow lengkap → finish tulis .env + config.json + installed.lock; semua step 403 sesudahnya; status → installed:true', async () => {
    fakePg.query
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] })
      .mockResolvedValueOnce({ rows: [{ has_migrations: null, has_users: null }] });
    const app = buildApp();
    const dbR = await request(app, 'POST', '/api/install/step/db', { ...goodConn });
    expect(dbR.status).toBe(200);
    const migR = await request(app, 'POST', '/api/install/step/migrate');
    expect(migR.status).toBe(200);

    fakePg.query.mockReset();
    fakePg.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'u1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    fakePg.pool.connect.mockClear();
    const adminR = await request(app, 'POST', '/api/install/step/admin', {
      email: 'admin@kr.local', password: 'rahasia123',
    });
    expect(adminR.status).toBe(200);

    const st = await request(app, 'POST', '/api/install/step/storage', {
      provider: 'r2', config: { bucket: 'kr-bucket', endpoint: 'https://r2.example.com' },
    });
    expect(st.status).toBe(200);

    // bootstrap: fake pg pool dijalankan ulang (migrate + createFirstAdmin) — resolusi akhir
    fakePg.pool.connect.mockClear();
    fakePg.query.mockReset();
    fakePg.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'u1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const fin = await request(app, 'POST', '/api/install/finish', { baseUrl: 'https://kr.local' });
    expect(fin.status).toBe(200);
    expect(fin.json.ok).toBe(true);

    const files = (await readdir(dir)).sort();
    expect(files).toEqual(['.env', 'config.json', 'installed.lock']);
    const env = await readFile(path.join(dir, '.env'), 'utf8');
    expect(env).toContain('DATABASE_URL=postgres://kr:x%40%2Fy@127.0.0.1:5432/kr');
    expect(env).toContain('JWT_SECRET=');
    const config = JSON.parse(await readFile(path.join(dir, 'config.json'), 'utf8'));
    expect(config.storage.provider).toBe('r2');
    expect(config.storage.bucket).toBe('kr-bucket');
    expect(config.baseUrl).toBe('https://kr.local');
    const lock = JSON.parse(await readFile(path.join(dir, 'installed.lock'), 'utf8'));
    expect(lock.installedAt).toBeTruthy();

    // GUARD: semua POST kini 403, status installed:true
    const blocked = await request(app, 'POST', '/api/install/step/db', { ...goodConn });
    expect(blocked.status).toBe(403);
    const status = await request(app, 'GET', '/api/install/status');
    expect(status.json.installed).toBe(true);
  });

  it('step/storage provider tidak dikenal → 400', async () => {
    fakePg.query
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] })
      .mockResolvedValueOnce({ rows: [{ has_migrations: null, has_users: null }] });
    const app = buildApp();
    await request(app, 'POST', '/api/install/step/db', { ...goodConn });
    await request(app, 'POST', '/api/install/step/migrate');
    fakePg.query.mockReset();
    fakePg.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'u1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    fakePg.pool.connect.mockClear();
    await request(app, 'POST', '/api/install/step/admin', {
      email: 'admin@kr.local', password: 'rahasia123',
    });
    const res = await request(app, 'POST', '/api/install/step/storage', { provider: 's3', config: {} });
    expect(res.status).toBe(400);
    expect(res.json.message).toMatch(/provider/);
  });

  it('parseDsn via component langsung: port non-numerik → throw', async () => {
    const { parseDsn, testConnection, checkSchema } = await import('./installer/validator.js');
    expect(() => parseDsn({ host: 'h', port: 'abc', database: 'd', user: 'u', password: 'p' })).toThrow(/port/);
    expect(() => parseDsn({ host: 'h', port: '5432', database: 'd', user: 'u', password: '' })).toThrow(/password/);
    expect(() => parseDsn({ host: '', port: '5432', database: 'd', user: 'u', password: 'p' })).toThrow(/wajib/);

    const bad = await testConnection({ query: vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')) }, 500);
    expect(bad.ok).toBe(false);
    expect(bad.stage).toBe('connect');

    const ok = await checkSchema({ query: vi.fn().mockResolvedValue({ rows: [{ has_migrations: 'schema_migrations', has_users: null }] }) });
    expect(ok.hasSchema).toBe(true);

    const c = parseDsn({ host: '127.0.0.1', port: '5432', database: 'kr', user: 'kr', password: 'x' });
    expect(c.port).toBe(5432);
  });
});