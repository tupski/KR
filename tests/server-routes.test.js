/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildServer } from '../server/index.js';
import { loadConfig } from '../server/config.js';

/**
 * Black-box route tests via fastify.inject() — no live port, no DB required
 * (DB-dependent routes are not exercised here; auth service is mocked away by
 * only hitting endpoints that do not touch PostgreSQL: /health, /api/upload,
 * /api/blob (401 without session), SPA fallback, unknown API 404).
 */
describe('Fastify runtime route tests', () => {
  let app;
  let tmpDir;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-server-test-'));
    const cfg = loadConfig({
      NODE_ENV: 'development',
      JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
      STORAGE_DRIVER: 'local',
      LOCAL_STORAGE_PATH: tmpDir,
      UPLOAD_REQUIRE_AUTH: 'false', // isolate upload validation from auth in these tests
      MAX_UPLOAD_SIZE: '1024',
    });
    app = await buildServer(cfg);
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('GET /api/blob requires authentication (private media)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/blob?pathname=uploads/a.webp' });
    expect(res.statusCode).toBe(401);
  });

  it('unknown /api route returns JSON 404 (not index.html)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('POST /api/upload rejects disallowed MIME type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      headers: { 'content-type': 'application/x-msdownload', 'x-file-name': 'malware.exe', 'x-folder': 'uploads' },
      payload: Buffer.from('MZ...'),
    });
    expect(res.statusCode).toBe(415);
  });

  it('POST /api/upload rejects disallowed extension even with image MIME', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      headers: { 'content-type': 'image/png', 'x-file-name': 'shell.php', 'x-folder': 'uploads' },
      payload: Buffer.from('fakepng'),
    });
    expect(res.statusCode).toBe(415);
  });

  it('POST /api/upload accepts valid image and returns legacy-compatible contract', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      headers: { 'content-type': 'image/webp', 'x-file-name': 'photo (1).webp', 'x-folder': 'ktp-images' },
      payload: Buffer.from('RIFFfake-webp-bytes'),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pathname).toMatch(/^ktp-images\/\d+-[a-z0-9]+-photo__1_.webp$/);
    expect(body.proxyUrl).toBe(`/api/blob?pathname=${encodeURIComponent(body.pathname)}`);
    expect(body.access).toBe('private');
    // File physically written under storage root
    expect(fs.existsSync(path.join(tmpDir, body.pathname))).toBe(true);
  });

  it('POST /api/upload rejects path traversal in x-folder header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      headers: { 'content-type': 'image/png', 'x-file-name': 'a.png', 'x-folder': '../../etc' },
      payload: Buffer.from('fakepng'),
    });
    // Folder is sanitized to etc (non-alnum stripped, traversal segments removed) — never escapes root
    if (res.statusCode === 200) {
      const body = res.json();
      expect(body.pathname.startsWith('etc/')).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, body.pathname))).toBe(true);
    } else {
      expect([400, 415]).toContain(res.statusCode);
    }
    // Critical: nothing written outside storage root
    expect(fs.existsSync(path.resolve(tmpDir, '..', 'etc'))).toBe(false);
  });

  it('POST /api/upload enforces MAX_UPLOAD_SIZE (413)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      headers: { 'content-type': 'image/png', 'x-file-name': 'big.png', 'x-folder': 'uploads' },
      payload: Buffer.alloc(2048, 7), // limit configured to 1024
    });
    expect(res.statusCode).toBe(413);
  });

  it('CORS rejects non-allowlisted origin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example.com' },
    });
    // health has rateLimit false but CORS hook still applies: rejected origin -> error
    expect([400, 500]).toContain(res.statusCode);
  });

  it('CORS accepts allowlisted origin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(res.statusCode).toBe(200);
  });
});
