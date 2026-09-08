/* eslint-env node */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LocalStorageDriver, sanitizeStorageKey, toCanonicalKey } from '../server/storage/local.js';
import { getStorageDriver, resolveStorageReference } from '../server/storage/index.js';

describe('Storage Abstraction Unit Tests', () => {
  const testStorageDir = path.resolve(process.cwd(), 'temp_test_storage');

  beforeEach(() => {
    fs.mkdirSync(testStorageDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
  });

  it('sanitizeStorageKey prevents path traversal', () => {
    expect(sanitizeStorageKey('../../etc/passwd')).toBe('etc/passwd');
    expect(sanitizeStorageKey('uploads/..//secret.txt')).toBe('uploads/secret.txt');
    expect(sanitizeStorageKey('/uploads/test.jpg')).toBe('uploads/test.jpg');
  });

  it('toCanonicalKey strips origin and converts URLs', () => {
    const url = 'https://store.private.blob.vercel-storage.com/uploads/ktp/photo.webp';
    expect(toCanonicalKey(url)).toBe('uploads/ktp/photo.webp');
  });

  it('LocalStorageDriver correctly uploads and reads back file', async () => {
    const driver = new LocalStorageDriver(testStorageDir);
    const key = 'uploads/test/hello.txt';
    const buffer = Buffer.from('Hello World!');

    const uploadRes = await driver.upload(key, buffer);
    expect(uploadRes.key).toBe(key);
    expect(await driver.exists(key)).toBe(true);

    const readBuffer = await driver.get(key);
    expect(readBuffer.toString()).toBe('Hello World!');

    await driver.delete(key);
    expect(await driver.exists(key)).toBe(false);
  });

  it('resolveStorageReference transforms URLs correctly', () => {
    const legacyUrl = 'https://store.private.blob.vercel-storage.com/uploads/proof.png';
    const resolved = resolveStorageReference(legacyUrl);
    expect(resolved).toBe('/storage/uploads/proof.png');
  });
});
