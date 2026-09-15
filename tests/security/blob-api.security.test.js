import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock @supabase/supabase-js ──────────────────────────────────────────────
const supabaseState = vi.hoisted(() => ({
  getUserResult: { data: { user: null }, error: { message: 'invalid' } },
  // ownership lookup: null = objek tidak ada di DB
  ownership: null,
  roleToReturn: 'karyawan',
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => supabaseState.getUserResult),
    },
    from: (table) => ({
      select: () => ({
        like: () => ({
          range: async () => ({ data: supabaseState.ownership ? [supabaseState.ownership] : [] }),
        }),
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'user_roles') return { data: { role: supabaseState.roleToReturn } };
            return { data: null };
          },
        }),
      }),
    }),
  })),
}));

const handler = (await import('../../api/blob.js')).default;

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

const PATH = 'ktp-images/1788855954761-lrtm44-photo__1_.webp';

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-blob-token');
  vi.stubEnv('VERCEL_BLOB_STORE_ID', 'store_test123');
  supabaseState.getUserResult = { data: { user: { id: 'u-employee' } }, error: null };
  supabaseState.ownership = null;
  supabaseState.roleToReturn = 'karyawan';
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'image/webp' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }))
  );
});

describe('C-2 — /api/blob security', () => {
  it('anonymous (tanpa token/cookie) -> 401', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { pathname: PATH } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('token invalid -> 401', async () => {
    supabaseState.getUserResult = { data: { user: null }, error: { message: 'expired' } };
    const res = makeRes();
    await handler(
      { method: 'GET', headers: { authorization: 'Bearer bogus' }, query: { pathname: PATH } },
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('path traversal (..) -> 400 walau sudah login', async () => {
    supabaseState.ownership = { user_id: 'u-employee', ktp_image_url: `/api/blob?pathname=${PATH}` };
    const res = makeRes();
    await handler(
      {
        method: 'GET',
        headers: { authorization: 'Bearer ok' },
        query: { pathname: 'ktp-images/../../etc/passwd' },
      },
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('namespace di luar allow-list -> 400', async () => {
    const res = makeRes();
    await handler(
      {
        method: 'GET',
        headers: { authorization: 'Bearer ok' },
        query: { pathname: 'uploads/something.png' },
      },
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('pathname tanpa folder / malformed -> 400', async () => {
    const res = makeRes();
    await handler(
      { method: 'GET', headers: { authorization: 'Bearer ok' }, query: { pathname: 'justfile.png' } },
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('objek tidak ada di DB -> 404 (bukan isi Blob)', async () => {
    const res = makeRes();
    await handler(
      { method: 'GET', headers: { authorization: 'Bearer ok' }, query: { pathname: PATH } },
      res
    );
    expect(res.statusCode).toBe(404);
    // fetch ke blob TIDAK boleh terpanggil
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('bukan pemilik objek + role karyawan -> 404 (existence tidak dikonfirmasi)', async () => {
    supabaseState.ownership = { user_id: 'u-someone-else', ktp_image_url: `/api/blob?pathname=${PATH}` };
    const res = makeRes();
    await handler(
      { method: 'GET', headers: { authorization: 'Bearer ok' }, query: { pathname: PATH } },
      res
    );
    expect(res.statusCode).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('pemilik objek -> 200 + Cache-Control private no-store', async () => {
    supabaseState.ownership = { user_id: 'u-employee', ktp_image_url: `/api/blob?pathname=${PATH}` };
    const res = makeRes();
    await handler(
      { method: 'GET', headers: { authorization: 'Bearer ok' }, query: { pathname: PATH } },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('admin boleh membaca objek milik user lain -> 200', async () => {
    supabaseState.ownership = { user_id: 'u-someone-else', ktp_image_url: `/api/blob?pathname=${PATH}` };
    supabaseState.roleToReturn = 'admin';
    const res = makeRes();
    await handler(
      { method: 'GET', headers: { authorization: 'Bearer ok' }, query: { pathname: PATH } },
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('super_admin boleh membaca objek milik user lain -> 200', async () => {
    supabaseState.ownership = { user_id: 'u-someone-else', ktp_image_url: `/api/blob?pathname=${PATH}` };
    supabaseState.roleToReturn = 'super_admin';
    const res = makeRes();
    await handler(
      { method: 'GET', headers: { authorization: 'Bearer ok' }, query: { pathname: PATH } },
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('Cookie sesi (kr_blob_session) diterima sebagai kredensial -> 200', async () => {
    supabaseState.ownership = { user_id: 'u-employee', ktp_image_url: `/api/blob?pathname=${PATH}` };
    const res = makeRes();
    await handler(
      {
        method: 'GET',
        headers: { cookie: 'kr_blob_session=cookie-token; other=x' },
        query: { pathname: PATH },
      },
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('LIKE wildcard injection: pathname dengan "_" tetap dicocokkan PERSIS -> 404 bukan akses', async () => {
    // Objek asli di DB: ktp-images/1788855954761-lrtm44-photo__1_.webp
    // Penyerang mencoba pathname dengan "_" yang pada LIKE lama akan
    // bertindak sebagai wildcard dan mencocokkan objek orang lain.
    supabaseState.ownership = {
      user_id: 'u-victim',
      ktp_image_url: `/api/blob?pathname=${PATH}`,
    };
    const res = makeRes();
    await handler(
      {
        method: 'GET',
        headers: { authorization: 'Bearer ok' },
        query: { pathname: 'ktp-images/1.webp' },
      },
      res
    );
    expect(res.statusCode).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('method selain GET/OPTIONS -> 405', async () => {
    const res = makeRes();
    await handler({ method: 'DELETE', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});
