/* eslint-env node */
/* global process */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Reject any key that tries to escape the storage root.
 * Returns a normalized relative key (forward slashes, no leading slash,
 * no '..', no absolute path, no NUL bytes). Throws on invalid input.
 */
export function sanitizeStorageKey(rawKey) {
  if (rawKey === null || rawKey === undefined) {
    throw new Error('Storage key tidak boleh kosong.');
  }
  if (typeof rawKey !== 'string') {
    throw new Error('Storage key harus berupa string.');
  }
  if (rawKey.length === 0) {
    throw new Error('Storage key tidak boleh kosong.');
  }
  if (rawKey.includes('\0')) {
    throw new Error('Storage key mengandung karakter tidak valid.');
  }

  let key = rawKey.replace(/\\/g, '/');

  // Strip a leading scheme://host (legacy full URLs) -> keep pathname only.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(key)) {
    try {
      key = new URL(key).pathname;
    } catch (_e) {
      throw new Error('Storage key berupa URL tidak valid.');
    }
  }

  key = key.replace(/^\/+/, ''); // no absolute path
  const segments = key
    .split('/')
    .filter((s) => s.length > 0 && s !== '.')
    .filter((s) => {
      if (s === '..') throw new Error('Path traversal tidak diizinkan.');
      return true;
    });

  const normalized = segments.join('/');
  if (!normalized) {
    throw new Error('Storage key tidak valid setelah normalisasi.');
  }
  // Absolute Windows drive letters (C:) or POSIX absolute cannot survive here
  // because we stripped leading slashes and split on '/'; assert anyway.
  if (/^[a-z]:/i.test(normalized)) {
    throw new Error('Path absolut tidak diizinkan.');
  }
  return normalized;
}

/** Extract a safe filename: basename + sanitized extension. */
export function safeFileName(name, fallbackExt = '') {
  const base = path.basename(String(name || '')).replace(/\\/g, '/');
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
  const finalName = cleaned || `file-${Date.now()}${fallbackExt}`;
  return finalName.slice(0, 180);
}

/** Convert any reference (legacy URL, /api/blob proxy, or key) to a canonical key. */
export function toCanonicalKey(input) {
  if (!input || typeof input !== 'string') return '';
  let value = input.trim();

  // Legacy proxy form: /api/blob?pathname=uploads%2Fktp%2Fa.webp
  if (value.startsWith('/api/blob')) {
    try {
      const url = new URL(value, 'http://local');
      const p = url.searchParams.get('pathname');
      if (p) value = p;
    } catch (_e) {
      // fall through
    }
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch (_e) {
      // keep raw
    }
  }

  try {
    return sanitizeStorageKey(value);
  } catch (_e) {
    return '';
  }
}

export class LocalStorageDriver {
  constructor(baseDir = process.env.LOCAL_STORAGE_PATH || path.resolve(process.cwd(), 'storage')) {
    this.baseDir = path.resolve(baseDir);
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  /**
   * Resolve a canonical key to an absolute path INSIDE baseDir.
   * Uses path.relative to defeat sibling-prefix escapes
   * (e.g. baseDir=/app/storage vs /app/storage_evil).
   */
  getFilePath(key) {
    const safeKey = sanitizeStorageKey(key);
    const resolvedPath = path.resolve(this.baseDir, safeKey);
    const rel = path.relative(this.baseDir, resolvedPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('Path traversal terdeteksi.');
    }
    return resolvedPath;
  }

  async upload(key, buffer, options = {}) {
    const targetPath = this.getFilePath(key);
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await fsp.writeFile(targetPath, buffer);
    const canonical = sanitizeStorageKey(key);
    return { key: canonical, url: this.getUrl(canonical), size: buffer.length, contentType: options.contentType || null };
  }

  async get(key) {
    const targetPath = this.getFilePath(key);
    try {
      return await fsp.readFile(targetPath);
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async getStream(key) {
    const targetPath = this.getFilePath(key);
    if (!fs.existsSync(targetPath)) return null;
    return fs.createReadStream(targetPath);
  }

  async exists(key) {
    const targetPath = this.getFilePath(key);
    try {
      await fsp.access(targetPath, fs.constants.R_OK);
      return true;
    } catch (_e) {
      return false;
    }
  }

  async stat(key) {
    const targetPath = this.getFilePath(key);
    try {
      return await fsp.stat(targetPath);
    } catch (_e) {
      return null;
    }
  }

  async delete(key) {
    const targetPath = this.getFilePath(key);
    try {
      await fsp.unlink(targetPath);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') return false;
      throw err;
    }
  }

  getUrl(key) {
    return `/storage/${sanitizeStorageKey(key)}`;
  }
}
