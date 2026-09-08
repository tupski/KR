/* eslint-env node */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  LocalStorageDriver, sanitizeStorageKey, toCanonicalKey, safeFileName,
} from '../server/storage/local.js';
import { getStorageDriver, resolveStorageReference, classifyStorageReference, resetStorageDriver } from '../server/storage/index.js';

describe('Storage Abstraction Unit Tests', () => {
  const testStorageDir = path.resolve(process.cwd(), 'temp_test_storage');

  beforeEach(() => {
    fs.mkdirSync(testStorageDir, { recursive: true });
    resetStorageDriver();
  });

  afterEach(() => {
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
    resetStorageDriver();
  });

  describe('sanitizeStorageKey', () => {
    it('rejects path traversal', () => {
      expect(() => sanitizeStorageKey('../../etc/passwd')).toThrow();
      expect(() => sanitizeStorageKey('uploads/../../secret.txt')).toThrow();
      expect(() => sanitizeStorageKey('/etc/passwd')).not.toThrow(); // leading slash stripped, no traversal
      expect(sanitizeStorageKey('/uploads/test.jpg')).toBe('uploads/test.jpg');
    });

    it('normalizes slashes and strips URL origin', () => {
      expect(sanitizeStorageKey('uploads//a///b.webp')).toBe('uploads/a/b.webp');
      expect(sanitizeStorageKey('https://x.public.blob.vercel-storage.com/uploads/a.webp')).toBe('uploads/a.webp');
    });

    it('rejects absolute windows paths and NUL bytes', () => {
      expect(() => sanitizeStorageKey('C:/Windows/x')).toThrow();
      expect(() => sanitizeStorageKey('uploads/a\0b')).toThrow();
    });

    it('throws on empty input', () => {
      expect(() => sanitizeStorageKey('')).toThrow();
      expect(() => sanitizeStorageKey(null)).toThrow();
    });
  });

  it('safeFileName strips bad chars and directory parts', () => {
    expect(safeFileName('../evil/shell.php', '.webp')).toBe('shell.php');
    expect(safeFileName('a b c (1).webp')).toBe('a_b_c__1_.webp');
  });

  it('toCanonicalKey converts legacy URLs and proxy paths', () => {
    expect(toCanonicalKey('https://store.private.blob.vercel-storage.com/uploads/ktp/photo.webp')).toBe('uploads/ktp/photo.webp');
    expect(toCanonicalKey('/api/blob?pathname=uploads%2Fktp%2Fphoto.webp')).toBe('uploads/ktp/photo.webp');
  });

  it('LocalStorageDriver correctly uploads, reads, and deletes', async () => {
    const driver = new LocalStorageDriver(testStorageDir);
    const key = 'uploads/test/hello.txt';
    const buffer = Buffer.from('Hello World!');

    const uploadRes = await driver.upload(key, buffer);
    expect(uploadRes.key).toBe(key);
    expect(await driver.exists(key)).toBe(true);
    expect((await driver.get(key)).toString()).toBe('Hello World!');

    await driver.delete(key);
    expect(await driver.exists(key)).toBe(false);
  });

  it('LocalStorageDriver getFilePath blocks sibling-prefix escape', () => {
    const driver = new LocalStorageDriver(testStorageDir);
    // baseDir = .../temp_test_storage ; ../temp_test_storage_evil must be rejected
    expect(() => driver.getFilePath('../temp_test_storage_evil/x')).toThrow();
  });

  it('classifyStorageReference distinguishes legacy vs canonical', () => {
    expect(classifyStorageReference('https://x.private.blob.vercel-storage.com/a/b.webp').kind).toBe('legacy-vercel-private');
    expect(classifyStorageReference('https://x.public.blob.vercel-storage.com/a/b.webp').kind).toBe('legacy-vercel-public');
    expect(classifyStorageReference('/api/blob?pathname=a/b.webp').kind).toBe('legacy-proxy');
    expect(classifyStorageReference('uploads/a/b.webp').kind).toBe('canonical');
  });

  it('getStorageDriver returns local driver by default and r2 aliases to s3 impl', () => {
    const local = getStorageDriver({ STORAGE_DRIVER: 'local', LOCAL_STORAGE_PATH: testStorageDir });
    expect(local.constructor.name).toBe('LocalStorageDriver');
    resetStorageDriver();
    const r2 = getStorageDriver({ STORAGE_DRIVER: 'r2', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's' });
    expect(r2.constructor.name).toBe('S3StorageDriver');
    resetStorageDriver();
    expect(() => getStorageDriver({ STORAGE_DRIVER: 'ftp' })).toThrow();
  });

  it('resolveStorageReference maps legacy URL to /storage path (local driver)', () => {
    process.env.STORAGE_DRIVER = 'local';
    process.env.LOCAL_STORAGE_PATH = testStorageDir;
    resetStorageDriver();
    const resolved = resolveStorageReference('https://store.private.blob.vercel-storage.com/uploads/proof.png');
    expect(resolved).toBe('/storage/uploads/proof.png');
  });
});
