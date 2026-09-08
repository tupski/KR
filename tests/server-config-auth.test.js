/* eslint-env node */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig } from '../server/config.js';
import { safeEqualSecret, requireRole, ROLE_HIERARCHY } from '../server/middleware/auth.js';

describe('server/config.js', () => {
  it('production refuses to start with weak/missing JWT secret', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'short', APP_URL: 'https://a.example' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production', APP_URL: 'https://a.example' })).toThrow(/JWT_SECRET/);
  });

  it('production refuses to start without DATABASE_URL', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), APP_URL: 'https://a.example' })).toThrow(/DATABASE_URL/);
  });

  it('s3/r2 driver without bucket is rejected', () => {
    expect(() => loadConfig({
      NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), APP_URL: 'https://a.example',
      DATABASE_URL: 'postgresql://u:p@h:5432/d', STORAGE_DRIVER: 's3',
    })).toThrow(/S3_BUCKET/);
  });

  it('production CORS defaults to APP_URL origin only (never *)', () => {
    const cfg = loadConfig({
      NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), APP_URL: 'https://admin.example.com',
      DATABASE_URL: 'postgresql://u:p@h:5432/d',
    });
    expect(cfg.corsOrigins).toEqual(['https://admin.example.com']);
    expect(cfg.cookieSecure).toBe(true);
    expect(cfg.cookieSameSite).toBe('lax');
  });

  it('parses upload limits and lists', () => {
    const cfg = loadConfig({ NODE_ENV: 'development', MAX_UPLOAD_SIZE: '2048', UPLOAD_ALLOWED_EXT: '.png,.jpg' });
    expect(cfg.maxUploadBytes).toBe(2048);
    expect(cfg.uploadAllowedExt).toEqual(['.png', '.jpg']);
  });

  it('public registration disabled by default', () => {
    expect(loadConfig({ NODE_ENV: 'development' }).bootstrap.allowPublicRegister).toBe(false);
    expect(loadConfig({ NODE_ENV: 'development', AUTH_ALLOW_PUBLIC_REGISTER: 'true' }).bootstrap.allowPublicRegister).toBe(true);
  });
});

describe('server/middleware/auth.js', () => {
  it('safeEqualSecret is constant-shape and rejects mismatches', () => {
    expect(safeEqualSecret('abc', 'abc')).toBe(true);
    expect(safeEqualSecret('abc', 'abd')).toBe(false);
    expect(safeEqualSecret('abc', 'ab')).toBe(false);
    expect(safeEqualSecret('', '')).toBe(false);
    expect(safeEqualSecret(null, 'x')).toBe(false);
  });

  it('requireRole denies lower roles and allows listed roles (IDOR/privilege check)', async () => {
    const guard = requireRole('admin', 'super_admin');

    const denyReply = { code(n) { this._code = n; return this; }, send(b) { this._body = b; this.sent = true; return this; } };
    const reqKaryawan = { authUser: { id: 'u1', role: 'karyawan' } };
    await guard(reqKaryawan, denyReply);
    expect(denyReply._code).toBe(403);

    const reqAdmin = { authUser: { id: 'u2', role: 'admin' } };
    const okReply = { code(n) { this._code = n; return this; }, send(b) { this.sent = true; return this; } };
    await guard(reqAdmin, okReply);
    expect(okReply._code).toBeUndefined();

    const anonReply = { code(n) { this._code = n; return this; }, send() { this.sent = true; return this; } };
    await guard({}, anonReply);
    expect(anonReply._code).toBe(401);
  });

  it('role hierarchy is ordered karyawan < admin < super_admin', () => {
    expect(ROLE_HIERARCHY.karyawan).toBeLessThan(ROLE_HIERARCHY.admin);
    expect(ROLE_HIERARCHY.admin).toBeLessThan(ROLE_HIERARCHY.super_admin);
  });
});
