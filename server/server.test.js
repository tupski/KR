// @vitest-environment node
// A3 auth (hash/jwt) + server integration (login flow, dbRoutes whitelist) via mock pool.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPool = {
  query: vi.fn(),
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
    mockPool.query.mockResolvedValueOnce({ rows: [user] });
    const token = signToken({ userId: 'u1', role: 'admin' }, cfg.jwtSecret, '1h');
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'GET', '/api/auth/me', { cookie: `kr_session=${token}` });
    expect(res.status).toBe(200);
    expect(res.json.user.email).toBe('a@b.c');
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
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'GET', '/api/db/secret_table', { cookie: `kr_session=${testToken('karyawan')}` });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain('not allowed');
  });

  it('allowed table with range → paginated query + count', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'GET', '/api/db/system_settings?range=0,10', { cookie: `kr_session=${testToken('karyawan')}` });
    expect(res.status).toBe(200);
    expect(res.json.data).toEqual([{ id: 1 }]);
    expect(res.json.totalCount).toBe(1);
    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toContain('LIMIT $1 OFFSET $2');
  });

  it('unauthenticated GET /api/db/* → 401', async () => {
    const app = createApp({ cfg, pool: mockPool });
    const res = await request(app, 'GET', '/api/db/transactions?range=0,10');
    expect(res.status).toBe(401);
  });
});