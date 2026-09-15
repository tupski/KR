/* eslint-env node */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PassThrough } from 'stream';

// ── Mock @supabase/supabase-js ──────────────────────────────────────────────
const supabaseState = vi.hoisted(() => ({
  getUserResult: { data: { user: null }, error: { message: 'invalid token' } },
  roleToReturn: 'karyawan',
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => supabaseState.getUserResult),
    },
    from: (table) => {
      if (table === 'user_roles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { role: supabaseState.roleToReturn } }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
  })),
}));

vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (pathname) => ({
    pathname,
    url: `https://store.example.private.blob.vercel-storage.com/${pathname}`,
  })),
}));

const handler = (await import('../../api/upload.js')).default;

const makeRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    send(d) { this.body = d; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    end() { return this; },
  };
  return res;
};

const makeReq = async ({ method = 'POST', headers = {}, body = Buffer.alloc(0) } = {}) => {
  const req = new PassThrough();
  req.method = method;
  req.headers = headers;
  if (body.length) req.write(body);
  req.end();
  // beri kesempatan stream flush sebelum handler iterate
  await new Promise((r) => setImmediate(r));
  return req;
};

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key');
  vi.stubEnv('BLOB_OBJECT_ACCESS', 'private');
  supabaseState.getUserResult = { data: { user: { id: 'u-employee' } }, error: null };
  supabaseState.roleToReturn = 'karyawan';
});

describe('H-1 — /api/upload security', () => {
  it('anonymous (tanpa Authorization) -> 401', async () => {
    const res = makeRes();
    await handler(await makeReq({ headers: { 'x-folder': 'ktp-images' }, body: PNG_BYTES }), res);
    expect(res.statusCode).toBe(401);
  });

  it('token invalid -> 401', async () => {
    supabaseState.getUserResult = { data: { user: null }, error: { message: 'bad jwt' } };
    const res = makeRes();
    await handler(
      await makeReq({ headers: { authorization: 'Bearer bogus', 'x-folder': 'ktp-images' }, body: PNG_BYTES }),
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('folder di luar allow-list -> 400', async () => {
    const res = makeRes();
    await handler(
      await makeReq({
        headers: { authorization: 'Bearer ok', 'x-folder': 'uploads' },
        body: PNG_BYTES,
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('folder traversal (x-folder="../etc") -> 400', async () => {
    const res = makeRes();
    await handler(
      await makeReq({
        headers: { authorization: 'Bearer ok', 'x-folder': '../etc' },
        body: PNG_BYTES,
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('karyawan upload tagihan-proofs (privileged) -> 403', async () => {
    const res = makeRes();
    await handler(
      await makeReq({
        headers: { authorization: 'Bearer ok', 'x-folder': 'tagihan-proofs' },
        body: PNG_BYTES,
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('admin upload tagihan-proofs -> 200', async () => {
    supabaseState.roleToReturn = 'admin';
    const res = makeRes();
    await handler(
      await makeReq({
        headers: { authorization: 'Bearer ok', 'x-folder': 'tagihan-proofs', 'content-type': 'image/png' },
        body: PNG_BYTES,
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.pathname).toMatch(/^tagihan-proofs\//);
  });

  it('file oversized (>5MB) -> 413', async () => {
    const res = makeRes();
    await handler(
      await makeReq({
        headers: { authorization: 'Bearer ok', 'x-folder': 'ktp-images', 'content-type': 'image/png' },
        body: Buffer.alloc(5 * 1024 * 1024 + 1),
      }),
      res
    );
    expect(res.statusCode).toBe(413);
  });

  it('MIME tidak diizinkan (text/html) -> 415', async () => {
    const res = makeRes();
    await handler(
      await makeReq({
        headers: { authorization: 'Bearer ok', 'x-folder': 'ktp-images', 'content-type': 'text/html' },
        body: Buffer.from('<script>alert(1)</script>'),
      }),
      res
    );
    expect(res.statusCode).toBe(415);
  });

  it('MIME diklaim image/png tapi isi bukan PNG (magic bytes) -> 415', async () => {
    const res = makeRes();
    await handler(
      await makeReq({
        headers: { authorization: 'Bearer ok', 'x-folder': 'ktp-images', 'content-type': 'image/png' },
        body: Buffer.from('MZ fake executable'),
      }),
      res
    );
    expect(res.statusCode).toBe(415);
  });

  it('malicious filename (path traversal) disaniter server-side -> 200, pathname bersih', async () => {
    const res = makeRes();
    await handler(
      await makeReq({
        headers: {
          authorization: 'Bearer ok',
          'x-folder': 'ktp-images',
          'content-type': 'image/png',
          'x-file-name': '../../evil/../../ktp<script>.png',
        },
        body: PNG_BYTES,
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.pathname).toMatch(/^ktp-images\//);
    expect(res.body.pathname).not.toContain('..');
    // tidak ada slash tambahan di filename (traversal dibuang server-side)
    expect(res.body.pathname.replace(/^ktp-images\//, '')).not.toContain('/');
    expect(res.body.pathname).not.toContain('<');
  });

  it('upload sah karyawan ke ktp-images -> 200 dengan proxy URL private', async () => {
    const res = makeRes();
    await handler(
      await makeReq({
        headers: { authorization: 'Bearer ok', 'x-folder': 'ktp-images', 'content-type': 'image/png' },
        body: PNG_BYTES,
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.access).toBe('private');
    expect(res.body.url).toBe(`/api/blob?pathname=${encodeURIComponent(res.body.pathname)}`);
  });

  it('method selain POST -> 405', async () => {
    const res = makeRes();
    await handler(await makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });
});
