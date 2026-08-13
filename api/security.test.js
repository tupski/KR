/* eslint-env node */
/* global process, Buffer, fetch */
// @vitest-environment node
// Hardening VULN-003: auth + file validation + safe content types + headers.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetUser = vi.fn();
const mockPut = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

vi.mock('@vercel/blob', () => ({
  put: (...args) => mockPut(...args),
}));

import { sanitize, sanitizeFolder, validateUploadFile, isSafeInlineContentType, magicType } from './lib/files.js';
import { extractToken } from './lib/auth.js';
import uploadHandler from './upload.js';
import blobHandler from './blob.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(8, 0x20)]);
const HTML = Buffer.from('<!DOCTYPE html><script>alert(1)</script>');

function makeRes() {
  const res = {
    _status: 200,
    _json: null,
    _headers: {},
    _body: null,
    status: vi.fn(function (s) { this._status = s; return this; }),
    json: vi.fn(function (obj) { this._json = obj; return this; }),
    setHeader: vi.fn(function (k, v) { this._headers[k.toLowerCase()] = v; return this; }),
    send: vi.fn(function (b) { this._body = b; return this; }),
    end: vi.fn(function () { return this; }),
  };
  return res;
}

function streamReq(headers = {}, chunks = [PNG]) {
  return {
    method: 'POST',
    headers,
    query: {},
    [Symbol.asyncIterator]: async function* () {
      for (const c of chunks) yield c;
    },
  };
}

function authHeader() {
  return { authorization: 'Bearer valid-token' };
}

describe('api/lib/files.js: validasi file', () => {
  it('magicType: png/jpeg/pdf dikenali, html tidak', () => {
    expect(magicType(PNG)).toBe('image/png');
    expect(magicType(JPEG)).toBe('image/jpeg');
    expect(magicType(PDF)).toBe('application/pdf');
    expect(magicType(HTML)).toBeNull();
  });

  it('validateUploadFile: ekstensi+magic cocok → ok dengan mime aman', () => {
    expect(validateUploadFile({ fileName: 'a.png', buffer: PNG })).toEqual({ ok: true, mime: 'image/png' });
    expect(validateUploadFile({ fileName: 'a.pdf', buffer: PDF }).ok).toBe(true);
  });

  it('validateUploadFile: ekstensi dilarang / isi tidak cocok / tanpa ekstensi → tolak', () => {
    expect(validateUploadFile({ fileName: 'a.html', buffer: HTML }).ok).toBe(false);
    expect(validateUploadFile({ fileName: 'a.png', buffer: HTML }).ok).toBe(false); // html diselundupkan sebagai png
    expect(validateUploadFile({ fileName: 'a.jpg', buffer: PNG }).ok).toBe(false);  // magic mismatch
    expect(validateUploadFile({ fileName: 'noext', buffer: PNG }).ok).toBe(false);
  });

  it('sanitize: buang path traversal + karakter berbahaya', () => {
    expect(sanitize('../../etc/passwd.png')).toBe('passwd.png');
    expect(sanitize('a<b>c?.png')).toBe('a_b_c_.png');
    expect(sanitize('f.png')).toBe('f.png');
    expect(sanitizeFolder('../x/')).toBe('.._x');
  });

  it('isSafeInlineContentType: gambar/pdf inline, html/script attachment', () => {
    expect(isSafeInlineContentType('image/png')).toBe(true);
    expect(isSafeInlineContentType('application/pdf')).toBe(true);
    expect(isSafeInlineContentType('text/html')).toBe(false);
    expect(isSafeInlineContentType('application/x-javascript')).toBe(false);
  });
});

describe('api/lib/auth.js: ekstraksi token', () => {
  it('Bearer header atau ?token= diekstrak', () => {
    expect(extractToken({ headers: { authorization: 'Bearer abc' }, query: {} })).toBe('abc');
    expect(extractToken({ headers: {}, query: { token: 'xyz' } })).toBe('xyz');
    expect(extractToken({ headers: {}, query: {} })).toBeNull();
  });
});

describe('api/upload.js', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sr-key';
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockPut.mockReset();
    mockPut.mockResolvedValue({ pathname: 'uploads/f.png', url: 'https://blob.local/f.png' });
  });
  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('tanpa token → 401, put tidak dipanggil', async () => {
    const res = makeRes();
    await uploadHandler(streamReq({ 'x-file-name': 'f.png' }), res);
    expect(res._status).toBe(401);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('token invalid → 401', async () => {
    mockGetUser.mockResolvedValueOnce({ data: null, error: new Error('invalid token') });
    const res = makeRes();
    await uploadHandler(streamReq({ 'x-file-name': 'f.png', ...authHeader() }), res);
    expect(res._status).toBe(401);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('png valid → 200; contentType dari ekstensi, bukan header klien', async () => {
    const res = makeRes();
    await uploadHandler(streamReq({ 'x-file-name': 'f.png', 'content-type': 'text/html', ...authHeader() }), res);
    expect(res._status).toBe(200);
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut.mock.calls[0][2].contentType).toBe('image/png');
    expect(res._json.uploadedBy).toBe('u1');
  });

  it('html diselundupkan sebagai .png → 400', async () => {
    const res = makeRes();
    await uploadHandler(streamReq({ 'x-file-name': 'f.png', ...authHeader() }, [HTML]), res);
    expect(res._status).toBe(400);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('ekstensi dilarang (.html) → 400', async () => {
    const res = makeRes();
    await uploadHandler(streamReq({ 'x-file-name': 'f.html', ...authHeader() }, [HTML]), res);
    expect(res._status).toBe(400);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('nama file traversal dinormalisasi (sanitize)', async () => {
    const res = makeRes();
    await uploadHandler(streamReq({ 'x-file-name': '../../../etc/passwd.png', ...authHeader() }), res);
    expect(res._status).toBe(200);
    expect(mockPut.mock.calls[0][0]).toContain('uploads/');
    expect(mockPut.mock.calls[0][0]).not.toContain('..');
  });
});

describe('api/blob.js', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sr-key';
    process.env.BLOB_READ_WRITE_TOKEN = 'rw-token';
    process.env.VERCEL_BLOB_BASE_URL = 'https://blob.local';
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL_BLOB_BASE_URL;
    vi.unstubAllGlobals();
  });

  const upstream = (contentType) => ({
    ok: true,
    status: 200,
    headers: { get: (k) => (k === 'content-type' ? contentType : null) },
    arrayBuffer: async () => Buffer.from('bytes').buffer,
  });

  it('tanpa token → 401, fetch upstream tidak dipanggil', async () => {
    const res = makeRes();
    await blobHandler({ method: 'GET', headers: {}, query: { pathname: 'uploads/f.png' } }, res);
    expect(res._status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('token valid di query → 200; nosniff + CSP + inline untuk gambar', async () => {
    fetch.mockResolvedValueOnce(upstream('image/png'));
    const res = makeRes();
    await blobHandler({ method: 'GET', headers: {}, query: { pathname: 'uploads/f.png', token: 'tok' } }, res);
    expect(res._status).toBe(200);
    expect(res._headers['x-content-type-options']).toBe('nosniff');
    expect(res._headers['content-security-policy']).toContain("default-src 'none'");
    expect(res._headers['content-disposition']).toBe('inline');
    expect(res._headers['content-type']).toBe('image/png');
  });

  it('content-type tidak aman (text/html) → dipaksa octet-stream + attachment', async () => {
    fetch.mockResolvedValueOnce(upstream('text/html'));
    const res = makeRes();
    await blobHandler({ method: 'GET', headers: {}, query: { pathname: 'uploads/f.html', token: 'tok' } }, res);
    expect(res._status).toBe(200);
    expect(res._headers['content-type']).toBe('application/octet-stream');
    expect(res._headers['content-disposition']).toBe('attachment');
    expect(res._headers['x-content-type-options']).toBe('nosniff');
  });

  it('pathname traversal (..) → 400', async () => {
    const res = makeRes();
    await blobHandler({ method: 'GET', headers: {}, query: { pathname: '../etc/passwd', token: 'tok' } }, res);
    expect(res._status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('upstream error → status diteruskan', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const res = makeRes();
    await blobHandler({ method: 'GET', headers: {}, query: { pathname: 'uploads/missing.png', token: 'tok' } }, res);
    expect(res._status).toBe(404);
  });
});
