/* eslint-env node */
/* global process */

import fs from 'node:fs';
import path from 'node:path';

export function sanitizeStorageKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return '';
  return rawKey
    .replace(/\\/g, '/')
    .replace(/\.\./g, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
}

export function toCanonicalKey(input) {
  if (!input) return '';
  let pathname = input;
  try {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      const parsed = new URL(input);
      pathname = parsed.pathname;
    }
  } catch (_e) {
    pathname = input;
  }
  return sanitizeStorageKey(pathname);
}

export class LocalStorageDriver {
  constructor(baseDir = process.env.LOCAL_STORAGE_PATH || path.resolve(process.cwd(), 'storage')) {
    this.baseDir = path.resolve(baseDir);
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  getFilePath(key) {
    const safeKey = sanitizeStorageKey(key);
    const resolvedPath = path.resolve(this.baseDir, safeKey);
    if (!resolvedPath.startsWith(this.baseDir)) {
      throw new Error('Path traversal detected');
    }
    return resolvedPath;
  }

  async upload(key, buffer, _options = {}) {
    const targetPath = this.getFilePath(key);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, buffer);
    return { key: sanitizeStorageKey(key), url: `/storage/${sanitizeStorageKey(key)}` };
  }

  async get(key) {
    const targetPath = this.getFilePath(key);
    if (!fs.existsSync(targetPath)) return null;
    return fs.readFileSync(targetPath);
  }

  async exists(key) {
    const targetPath = this.getFilePath(key);
    return fs.existsSync(targetPath);
  }

  async delete(key) {
    const targetPath = this.getFilePath(key);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      return true;
    }
    return false;
  }

  getUrl(key) {
    return `/storage/${sanitizeStorageKey(key)}`;
  }
}
