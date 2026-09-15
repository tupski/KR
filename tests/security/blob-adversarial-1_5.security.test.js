/* eslint-env node */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Sprint 1.5 — bypass tambahan /api/blob: encoding, duplikat slash, casing,
// wildcard, LIKE metacharacter, dan verifikasi otorisasi case-sensitivity.

const supabaseState = vi.hoisted(() => ({
  getUserResult: { data: { user: null }, error: { message: 'invalid' } },
  ownership: null,
  roleToReturn: 'karyawan',
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => supabaseState.getUserResult) },
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
    statusCode: 200, headers: {}, body: null,
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    send(d) { this.body = d; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    end() { return this; },
  };
  return res;
};

const auth = (uid = 'u-employee') => ({ authorization: `Bearer t-${uid}` });

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-blob-token');
  vi.stubEnv('VERCEL_BLOB_STORE_ID', 'store_test123');
  supabaseState.getUserResult = { data: { user: { id: 'u-employee' } }, error: null };
  supabaseState.ownership = null;
  supabaseState.roleToReturn = 'karyawan';
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    headers: { get: () => 'image/webp' },
    arrayBuffer: async () => new Uint8Array([1]).buffer,
  })));
});

describe('C-2 tambahan (Sprint 1.5) — path & encoding bypass', () => {
  it('double-encoding (%252e%252e) -> 400 (karakter % ditolak sebelum decode kedua)', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: auth(), query: { pathname: 'ktp-images/%252e%252e/x.webp' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('URL-encoded traversal (%2e%2e%2f) -> 400 setelah decode', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: auth(), query: { pathname: 'ktp-images%2F..%2Fetc%2Fpasswd' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('backslash traversal (ktp-images\\..\\x) -> 400', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: auth(), query: { pathname: 'ktp-images\\..\\x.webp' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('duplikat slash (ktp-images//x.webp) -> 400', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: auth(), query: { pathname: 'ktp-images//x.webp' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('path sangat panjang (10k) -> 400/404 tanpa akses blob', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: auth(), query: { pathname: `ktp-images/${'a'.repeat(10000)}` } }, res);
    // Regex charset cocok (a-Z) tapi ownership lookup gagal -> 404;
    // yang penting: fetch ke blob TIDAK pernah dipanggil.
    expect([400, 404]).toContain(res.statusCode);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('SQL LIKE metacharacter di filename (a%b_c) -> 400 (charset ditolak)', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: auth(), query: { pathname: 'ktp-images/a%25b_c.webp' } }, res);
    // % encoded -> setelah decode jadi a%b_c -> regex menolak karena %
    expect(res.statusCode).toBe(400);
    // Pastikan tidak ada query DB yang dijalankan dengan pola attacker
  });

  it('case-fold folder (KTP-Images/x) -> 400 (folder harus lowercase persis)', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: auth(), query: { pathname: 'KTP-Images/x.webp' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('prefix mirip (ktp-images2/x) -> 400 (bukan di allow-list)', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: auth(), query: { pathname: 'ktp-images2/x.webp' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('folder wildcard (ktp-images-anything/x) -> 400', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: auth(), query: { pathname: 'ktp-images-anything/x.webp' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('hidden file (.hidden) -> 400', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: auth(), query: { pathname: 'ktp-images/.hidden' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('pathname kosong -> 400', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: auth(), query: { pathname: '' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('pathname undefined -> 400', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: auth(), query: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it('angka & underscore di filename valid tetap diterima jika milik sendiri -> 200', async () => {
    supabaseState.ownership = {
      user_id: 'u-employee',
      ktp_image_url: '/api/blob?pathname=ktp-images/1788855954761-lrtm44-photo__1_.webp',
    };
    const res = makeRes();
    await handler(
      { method: 'GET', headers: auth(), query: { pathname: 'ktp-images/1788855954761-lrtm44-photo__1_.webp' } },
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('filename casing berbeda (PHOTO__1_.WEBP) -> tidak match persis -> 404 (bukan fallback permissive)', async () => {
    supabaseState.ownership = {
      user_id: 'u-employee',
      ktp_image_url: '/api/blob?pathname=ktp-images/1788855954761-lrtm44-photo__1_.webp',
    };
    const res = makeRes();
    await handler(
      { method: 'GET', headers: auth(), query: { pathname: 'ktp-images/1788855954761-lrtm44-PHOTO__1_.WEBP' } },
      res
    );
    // includes() case-sensitive; ownership tidak match -> 404
    expect([404, 400]).toContain(res.statusCode);
  });

  it('gabungan authorization header kosong + cookie kosong -> 401', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer', cookie: '' }, query: { pathname: 'avatars/x.png' } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('cookie kr_blob_session kosong + tanpa header -> 401 (bukan bypass)', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: { cookie: 'kr_blob_session=' }, query: { pathname: 'avatars/x.png' } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('super_admin membaca folder mana pun di allow-list -> 200', async () => {
    supabaseState.ownership = {
      user_id: 'u-other',
      avatar_url: '/api/blob?pathname=avatars/u-other-123abc.png',
    };
    supabaseState.roleToReturn = 'super_admin';
    const res = makeRes();
    await handler({ method: 'GET', headers: auth('u-admin'), query: { pathname: 'avatars/u-other-123abc.png' } }, res);
    expect(res.statusCode).toBe(200);
  });
});
