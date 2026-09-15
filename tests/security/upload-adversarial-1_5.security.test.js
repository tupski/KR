/* eslint-env node */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PassThrough } from 'stream';

// ── Mock @supabase/supabase-js ──────────────────────────────────────────────
// createClient dipanggil DUA kali di upload.js: authClient (validasi token)
// dan authedClient (role lookup). Kita bedakan via opsi global.headers.
const supabaseState = vi.hoisted(() => ({
  getUserResult: { data: { user: null }, error: { message: 'invalid token' } },
  roleToReturn: 'karyawan',
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((_url, _key, opts) => {
    const isRoleClient = Boolean(opts?.global?.headers?.Authorization);
    return {
      auth: { getUser: vi.fn(async () => supabaseState.getUserResult) },
      from: (table) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              isRoleClient && table === 'user_roles'
                ? { data: { role: supabaseState.roleToReturn } }
                : { data: null },
          }),
        }),
      }),
    };
  }),
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
  await new Promise((r) => setImmediate(r));
  return req;
};

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key');
  vi.stubEnv('BLOB_OBJECT_ACCESS', 'private');
  supabaseState.getUserResult = { data: { user: { id: 'u-employee' } }, error: null };
  supabaseState.roleToReturn = 'karyawan';
});

describe('H-1 tambahan (Sprint 1.5) — bypass kredensial & filename', () => {
  it.each([
    ['empty bearer', 'Bearer '],
    ['bearer tanpa isi', 'Bearer'],
    ['bukan bearer', 'Basic dXNlcjpwYXNz'],
  ])('Authorization malformed (%s) -> 401', async (_label, authValue) => {
    const res = makeRes();
    await handler(
      await makeReq({ headers: { authorization: authValue, 'x-folder': 'ktp-images' }, body: PNG_BYTES }),
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('x-folder traversal berlapis (avatars/../tagihan-proofs) -> 400, TIDAK dipetakan ke folder privileged', async () => {
    supabaseState.roleToReturn = 'karyawan';
    const res = makeRes();
    await handler(
      await makeReq({
        headers: { authorization: 'Bearer ok', 'x-folder': 'avatars/../tagihan-proofs', 'content-type': 'image/png' },
        body: PNG_BYTES,
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(vi.mocked((await import('@vercel/blob')).put)).not.toHaveBeenCalled();
  });

  it('x-folder case-sensitivity (KTP-Images) -> 400', async () => {
    const res = makeRes();
    await handler(
      await makeReq({
        headers: { authorization: 'Bearer ok', 'x-folder': 'KTP-Images', 'content-type': 'image/png' },
        body: PNG_BYTES,
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('x-folder double-encoding (%2e%2e) -> 400', async () => {
    const res = makeRes();
    await handler(
      await makeReq({
        headers: { authorization: 'Bearer ok', 'x-folder': '%2e%2e', 'content-type': 'image/png' },
        body: PNG_BYTES,
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('filename null byte (\\0) dibuang oleh sanitasi -> 200, pathname tanpa \\0', async () => {
    const res = makeRes();
    await handler(
      await makeReq({
        headers: {
          authorization: 'Bearer ok',
          'x-folder': 'ktp-images',
          'content-type': 'image/png',
          'x-file-name': 'ktp\x00.png',
        },
        body: PNG_BYTES,
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.pathname).not.toContain('\0');
  });

  it('filename sangat panjang (5000 char) dipotong/disaniter -> 200 tanpa traversal', async () => {
    const res = makeRes();
    await handler(
      await makeReq({
        headers: {
          authorization: 'Bearer ok',
          'x-folder': 'ktp-images',
          'content-type': 'image/png',
          'x-file-name': `${'a'.repeat(5000)}..\\..\\evil.png`,
        },
        body: PNG_BYTES,
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const fname = res.body.pathname.replace(/^ktp-images\//, '');
    expect(fname).not.toContain('..');
    expect(fname.length).toBeLessThan(6000);
  });

  it('filename unicode control char (RTL override \\u202E) disaniter -> 200 bersih', async () => {
    const res = makeRes();
    await handler(
      await makeReq({
        headers: {
          authorization: 'Bearer ok',
          'x-folder': 'ktp-images',
          'content-type': 'image/png',
          'x-file-name': 'ktp\u202Egnp.exe',
        },
        body: PNG_BYTES,
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    // RTL override dibuang; nama final "ktp_gnp.exe" jelas terbaca (bukan
    // spoof visual), dan magic bytes sudah memvalidasi isinya PNG asli.
    expect(res.body.pathname).not.toContain('\u202E');
    expect(res.body.pathname).toMatch(/\.png$|\.exe$|\.bin$/);
  });

  it('MIME image/jpeg + body HTML -> 415', async () => {
    const res = makeRes();
    await handler(
      await makeReq({
        headers: { authorization: 'Bearer ok', 'x-folder': 'ktp-images', 'content-type': 'image/jpeg' },
        body: Buffer.from('<html><body>x</body></html>'),
      }),
      res
    );
    expect(res.statusCode).toBe(415);
  });

  it('MIME image/png + body JPEG asli -> 415 (magic bytes mismatch)', async () => {
    const res = makeRes();
    await handler(
      await makeReq({
        headers: { authorization: 'Bearer ok', 'x-folder': 'ktp-images', 'content-type': 'image/png' },
        body: JPEG_BYTES,
      }),
      res
    );
    expect(res.statusCode).toBe(415);
  });

  it('MIME dengan parameter charset (image/png; charset=utf-8) tetap divalidasi -> 200', async () => {
    const res = makeRes();
    await handler(
      await makeReq({
        headers: { authorization: 'Bearer ok', 'x-folder': 'ktp-images', 'content-type': 'image/png; charset=utf-8' },
        body: PNG_BYTES,
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });
});
