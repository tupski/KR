// @vitest-environment node
// A3 auth (hash/jwt) + server integration (login flow, dbRoutes whitelist) via mock pool.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPool = {
  query: vi.fn(),
  connect: vi.fn(),
};

vi.mock('./db.js', () => ({
  createPool: () => mockPool,
}));

// import after mock
const { hashPassword, verifyPassword, signToken, verifyToken, requireRole } = await import('./auth.js');
const { createApp } = await import('./index.js');
const { loadConfig } = await import('./config.js');

const cfg = loadConfig({
  PORT: '3000',
  DATABASE_URL: 'postgres://x:x@localhost:1/x',
  JWT_SECRET: 'secret-32chars-abcdefghijklmnopqrstuvwxyz',
  COOKIE_SECURE: 'false',
});

function testToken(role) {
  return signToken({ userId: 'u1', role }, cfg.jwtSecret, '1h');
}

async function request(app, method, url, { body, cookie, headers } = {}) {
  const server = app.listen(0);
  const port = server.address().port;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 4000);
  const res = await fetch(`http://127.0.0.1:${port}${url}`, {
    method,
    signal: ac.signal,
    headers: {
      'content-type': 'application/json',
      'x-requested-with': 'XMLHttpRequest',
      ...(cookie ? { cookie } : {}),
      ...(headers || {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  clearTimeout(timer);
  await new Promise((r) => server.close(r));
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, json, cookie: setCookie };
}

describe('A3: auth primitives', () => {
  it('hash unique per input, verify matches only correct plaintext', async () => {
    const h1 = await hashPassword('rahasia123');
    const h2 = await hashPassword('rahasia123');
    expect(h1).not.toBe(h2);
    expect(await verifyPassword('rahasia123', h1)).toBe(true);
    expect(await verifyPassword('salah', h1)).toBe(false);
  });

  it('jwt sign/verify: valid token carries role; tampered rejected', () => {
    const token = signToken({ userId: 'u1', role: 'admin' }, cfg.jwtSecret, '1h');
    expect(verifyToken(token, cfg.jwtSecret).role).toBe('admin');
    const tampered = token.slice(0, -4) + 'XXXX';
    expect(() => verifyToken(tampered, cfg.jwtSecret)).toThrow();
  });
});

describe('server: login flow', () => {
  beforeEach(() => mockPool.query.mockReset());

  it('login wrong password → 401', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'POST', '/api/auth/login', {
      body: { email: 'a@b.c', password: 'nope' },
    });
    expect(res.status).toBe(401);
  });

  it('login OK → cookie kr_session + user without password_hash', async () => {
    const user = { id: 'u1', email: 'a@b.c', password_hash: await hashPassword('pass'), full_name: 'A' };
    mockPool.query
      .mockResolvedValueOnce({ rows: [user] })            // SELECT user
      .mockResolvedValueOnce({ rows: [{ role: 'admin' }] }); // SELECT role
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'POST', '/api/auth/login', {
      body: { email: 'A@B.C', password: 'pass' },
    });
    expect(res.status).toBe(200);
    expect(res.cookie).toContain('kr_session=');
    expect(res.json.user).toBeTruthy();
    expect(res.json.user.password_hash).toBeUndefined();
  });

  it('GET /api/auth/me with valid cookie', async () => {
    const user = { id: 'u1', email: 'a@b.c', password_hash: 'x', full_name: 'A' };
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] }) // maintenance check
      .mockResolvedValueOnce({ rows: [] })                   // blacklist check
      .mockResolvedValueOnce({ rows: [user] })               // SELECT user
      .mockResolvedValueOnce({ rows: [{ role: 'admin' }] }); // SELECT role
    const token = signToken({ userId: 'u1', role: 'admin' }, cfg.jwtSecret, '1h');
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'GET', '/api/auth/me', { cookie: `kr_session=${token}` });
    expect(res.status).toBe(200);
    expect(res.json.user.email).toBe('a@b.c');
  });

  it('revoked jti → 401 (M1 blacklist)', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] }) // maintenance check
      .mockResolvedValueOnce({ rows: [{ jti: 'x' }] });      // blacklist check → revoked
    const token = signToken({ userId: 'u1', role: 'admin' }, cfg.jwtSecret, '1h');
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'GET', '/api/auth/me', { cookie: `kr_session=${token}` });
    expect(res.status).toBe(401);
    expect(res.json.error).toContain('revoked');
  });

  it('login rate limit: 5 gagal → 429 (T4)', async () => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [] }); // user tidak ketemu → 401
    const app = createApp({ cfg, pool: mockPool });
    for (let i = 0; i < 5; i++) {
      const r = await request(app, 'POST', '/api/auth/login', { body: { email: 'a@b.c', password: 'nope' } });
      expect(r.status).toBe(401);
    }
    const r6 = await request(app, 'POST', '/api/auth/login', { body: { email: 'a@b.c', password: 'nope' } });
    expect(r6.status).toBe(429);
  });

  it('POST /api/auth/register: karyawan tanpa role → 403 (M2)', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] }) // maintenance
      .mockResolvedValueOnce({ rows: [] });                   // blacklist
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'POST', '/api/auth/register', {
      cookie: `kr_session=${testToken('karyawan')}`,
      body: { email: 'a@b.c', password: 'rahasia123' },
    });
    expect(res.status).toBe(403);
  });

  it('POST /api/auth/register: super_admin membuat user (M2)', async () => {
    const fakeClient = { query: vi.fn(), release: vi.fn() };
    fakeClient.query
      .mockResolvedValueOnce({ rows: [] })                 // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'u2' }] })     // INSERT users
      .mockResolvedValueOnce({ rows: [] })                 // INSERT user_roles
      .mockResolvedValueOnce({ rows: [] })                 // INSERT user_profiles
      .mockResolvedValueOnce({ rows: [] });                // COMMIT
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] }) // maintenance
      .mockResolvedValueOnce({ rows: [] });                   // blacklist
    mockPool.connect.mockResolvedValue(fakeClient);
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'POST', '/api/auth/register', {
      cookie: `kr_session=${testToken('super_admin')}`,
      body: { email: 'new@kr.local', password: 'rahasia123', full_name: 'N', role: 'admin' },
    });
    expect(res.status).toBe(200);
    expect(res.json.data.id).toBe('u2');
    expect(fakeClient.query.mock.calls[1][1][1]).not.toBe('rahasia123');
  });

  it('POST /api/auth/change-password: old salah → 400 (M2)', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] }) // maintenance
      .mockResolvedValueOnce({ rows: [] })                   // blacklist
      .mockResolvedValueOnce({ rows: [{ password_hash: await hashPassword('benar') }] });
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'POST', '/api/auth/change-password', {
      cookie: `kr_session=${testToken('super_admin')}`,
      body: { old_password: 'salah', new_password: 'baru12345' },
    });
    expect(res.status).toBe(400);
  });

  it('requireRole super_admin rejects karyawan → 403', () => {
    const mw = requireRole('super_admin');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    mw({ user: { role: 'karyawan' } }, res, () => { throw new Error('next must not be called'); });
    expect(res.status).toHaveBeenCalledWith(403);
    const okRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    requireRole('super_admin')({ user: { role: 'super_admin' } }, okRes, () => {});
    expect(okRes.status).not.toHaveBeenCalled();
  });
});

describe('server: dbRoutes whitelist', () => {
  beforeEach(() => mockPool.query.mockReset());

  it('disallowed table → 400', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] }) // maintenance check
      .mockResolvedValueOnce({ rows: [] });                   // blacklist check
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'GET', '/api/db/secret_table', { cookie: `kr_session=${testToken('karyawan')}` });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain('not allowed');
  });

  it('allowed table with range → paginated query + count', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] })   // maintenance check
      .mockResolvedValueOnce({ rows: [] })                     // blacklist check
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })            // data
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });        // count
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'GET', '/api/db/system_settings?range=0,10', { cookie: `kr_session=${testToken('karyawan')}` });
    expect(res.status).toBe(200);
    expect(res.json.data).toEqual([{ id: 1 }]);
    expect(res.json.totalCount).toBe(1);
    const sql = mockPool.query.mock.calls[2][0];
    expect(sql).toContain('LIMIT $1 OFFSET $2');
  });

  it('unauthenticated GET /api/db/* → 401', async () => {
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'GET', '/api/db/transactions?range=0,10');
    expect(res.status).toBe(401);
  });
});

describe('server: RBAC dbRoutes (VULN-001 fix)', () => {
  beforeEach(() => mockPool.query.mockReset());

  it('karyawan PATCH user_roles (escalation) → 403, no UPDATE executed', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] }) // maintenance check
      .mockResolvedValueOnce({ rows: [] });                   // blacklist check
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'PATCH', '/api/db/user_roles/5', {
      cookie: `kr_session=${testToken('karyawan')}`,
      body: { role: 'super_admin' },
    });
    expect(res.status).toBe(403);
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });

  it('karyawan GET pengeluaran (financial read) → 403', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] })
      .mockResolvedValueOnce({ rows: [] });
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'GET', '/api/db/pengeluaran?range=0,10', { cookie: `kr_session=${testToken('karyawan')}` });
    expect(res.status).toBe(403);
  });

  it('karyawan PATCH transactions (tamper amount) → 403', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] })
      .mockResolvedValueOnce({ rows: [] });
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'PATCH', '/api/db/transactions/7', {
      cookie: `kr_session=${testToken('karyawan')}`,
      body: { cash_amount: 999999 },
    });
    expect(res.status).toBe(403);
  });

  it('karyawan PATCH transactions checkout_at → 200, scoped to own user_id', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 7 }] }); // UPDATE result
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'PATCH', '/api/db/transactions/7', {
      cookie: `kr_session=${testToken('karyawan')}`,
      body: { checkout_at: '2026-01-02T03:00:00Z' },
    });
    expect(res.status).toBe(200);
    const sql = mockPool.query.mock.calls[2][0];
    const params = mockPool.query.mock.calls[2][1];
    expect(sql).toContain('checkout_at = $1');
    expect(sql).toContain('AND user_id = $3');
    expect(params[2]).toBe('u1');
  });

  it('karyawan GET user_profiles → scoped WHERE id = own', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'u1' }] }) // data
      .mockResolvedValueOnce({ rows: [{ total: 1 }] }); // count
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'GET', '/api/db/user_profiles?range=0,10', { cookie: `kr_session=${testToken('karyawan')}` });
    expect(res.status).toBe(200);
    const sql = mockPool.query.mock.calls[2][0];
    expect(sql).toContain('WHERE id = $1');
    expect(mockPool.query.mock.calls[2][1][0]).toBe('u1');
  });

  it('karyawan DELETE transactions → 403', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] })
      .mockResolvedValueOnce({ rows: [] });
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'DELETE', '/api/db/transactions/7', { cookie: `kr_session=${testToken('karyawan')}` });
    expect(res.status).toBe(403);
  });

  it('admin PATCH user_roles → 403 (hanya super_admin)', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] })
      .mockResolvedValueOnce({ rows: [] });
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'PATCH', '/api/db/user_roles/5', {
      cookie: `kr_session=${testToken('admin')}`,
      body: { role: 'super_admin' },
    });
    expect(res.status).toBe(403);
  });
});

describe('server: RBAC rpcBridge (VULN-002 fix)', () => {
  beforeEach(() => mockPool.query.mockReset());

  it('karyawan admin_update_user → 403', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] })
      .mockResolvedValueOnce({ rows: [] });
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'POST', '/api/rpc/admin_update_user', {
      cookie: `kr_session=${testToken('karyawan')}`,
      body: { p_user_id: 'u1', p_role: 'super_admin' },
    });
    expect(res.status).toBe(403);
  });

  it('karyawan pay_tagihan_bulanan → 403', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] })
      .mockResolvedValueOnce({ rows: [] });
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'POST', '/api/rpc/pay_tagihan_bulanan', {
      cookie: `kr_session=${testToken('karyawan')}`,
      body: { p_tagihan_id: 1 },
    });
    expect(res.status).toBe(403);
  });

  it('admin pay_tagihan_bulanan → 200', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ok: true }] });
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'POST', '/api/rpc/pay_tagihan_bulanan', {
      cookie: `kr_session=${testToken('admin')}`,
      body: { p_tagihan_id: 1 },
    });
    expect(res.status).toBe(200);
    expect(res.json.data).toEqual([{ ok: true }]);
  });

  it('log_activity: p_user_id klien ditimpa dari JWT', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'POST', '/api/rpc/log_activity', {
      cookie: `kr_session=${testToken('karyawan')}`,
      body: { p_action: 'Input Transaksi', p_user_id: 'victim-999' },
    });
    expect(res.status).toBe(200);
    const sql = mockPool.query.mock.calls[2][0];
    const params = mockPool.query.mock.calls[2][1];
    expect(sql).toContain('"p_user_id"');
    expect(params).toContain('u1');
    expect(params).not.toContain('victim-999');
  });

  it('super_admin admin_update_user → 200', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ value: 'false' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ok: true }] });
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'POST', '/api/rpc/admin_update_user', {
      cookie: `kr_session=${testToken('super_admin')}`,
      body: { p_user_id: 'u1', p_role: 'admin' },
    });
    expect(res.status).toBe(200);
  });
});