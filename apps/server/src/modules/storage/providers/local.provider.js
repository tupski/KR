/**
 * @file local.provider.js
 * @description Local disk storage provider. Stores files under STORAGE_LOCAL_PATH
 * (defaults to ./storage relative to the process cwd).
 *
 * Implements the StorageProvider interface:
 *   upload(buffer, folder, filename, contentType) → Promise<{ url, pathname, access }>
 *   getFile(pathname)                             → Promise<{ stream, contentType }>
 *   delete(pathname)                              → Promise<void>
 *   list(prefix)                                  → Promise<Array<{ pathname, createdAt }>>
 *   resolveUrl(pathname)                          → string
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NotFoundError } from '../../../middleware/errorHandler.js';
import { lookupMime } from '../../../lib/mime.js';

/**
 * Sanitise a file path segment:
 *   - remove leading slashes
 *   - collapse `..` traversals
 *   - strip null bytes and other dangerous characters
 *
 * @param {string} raw
 * @returns {string}
 */
function sanitisePath(raw) {
  // Normalise separators, strip null bytes
  const clean = raw.replace(/\0/g, '').replace(/\\/g, '/');
  // Resolve relative segments without an absolute base
  const parts = clean.split('/').filter((p) => p !== '' && p !== '.');
  const safe = [];
  for (const part of parts) {
    if (part === '..') {
      safe.pop(); // discard traversal
    } else {
      safe.push(part);
    }
  }
  return safe.join('/');
}

/**
 * Build a unique filename: `{name}-{timestamp}-{random4hex}.{ext}`
 *
 * @param {string} original  Original filename (may include extension)
 * @returns {string}
 */
function buildUniqueFilename(original) {
  const ext  = path.extname(original).toLowerCase();
  const base = path.basename(original, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  const rand = crypto.randomBytes(4).toString('hex');
  return `${base}-${Date.now()}-${rand}${ext}`;
}

export class LocalProvider {
  constructor() {
    this._basePath = process.env.STORAGE_LOCAL_PATH || './storage';
  }

  /**
   * Absolute path to the storage root, resolved from cwd at call time.
   * @returns {string}
   */
  get basePath() {
    return path.resolve(process.cwd(), this._basePath);
  }

  // ── Interface implementation ───────────────────────────────────────────────

  /**
   * Save a buffer to disk under `{basePath}/{folder}/{uniqueFilename}`.
   *
   * @param {Buffer} buffer
   * @param {string} folder        e.g. 'ktp-images'
   * @param {string} originalName  Original filename used to derive extension
   * @param {string} [_contentType] Unused by local provider (mime derived from ext)
   * @returns {Promise<{ url: string, pathname: string, access: string }>}
   */
  async upload(buffer, folder, originalName, _contentType) {
    const safeFolder   = sanitisePath(folder);
    const uniqueName   = buildUniqueFilename(originalName);
    const relPathname  = `${safeFolder}/${uniqueName}`;
    const absDir       = path.join(this.basePath, safeFolder);
    const absFile      = path.join(absDir, uniqueName);

    fs.mkdirSync(absDir, { recursive: true });
    fs.writeFileSync(absFile, buffer);

    return {
      url:      `/api/storage/file/${relPathname}`,
      pathname: relPathname,
      access:   'private',
    };
  }

  /**
   * Open a read stream for the stored file.
   *
   * @param {string} pathname  Relative path, e.g. 'ktp-images/foo-123.jpg'
   * @returns {Promise<{ stream: import('fs').ReadStream, contentType: string }>}
   */
  async getFile(pathname) {
    const safePath = sanitisePath(pathname);
    const absPath  = path.join(this.basePath, safePath);

    if (!fs.existsSync(absPath)) {
      throw new NotFoundError(`File not found: ${pathname}`);
    }

    const contentType = lookupMime(absPath) || 'application/octet-stream';
    const stream      = fs.createReadStream(absPath);

    return { stream, contentType };
  }

  /**
   * Delete a file from disk. Idempotent — ignores ENOENT.
   *
   * @param {string} pathname
   * @returns {Promise<void>}
   */
  async delete(pathname) {
    const safePath = sanitisePath(pathname);
    const absPath  = path.join(this.basePath, safePath);
    try {
      fs.unlinkSync(absPath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  /**
   * List all files whose relative pathname starts with `prefix`.
   *
   * @param {string} prefix  e.g. 'ktp-images/'
   * @returns {Promise<Array<{ pathname: string, createdAt: Date }>>}
   */
  async list(prefix) {
    const safePrefix = sanitisePath(prefix);
    const absDir     = path.join(this.basePath, safePrefix);

    if (!fs.existsSync(absDir)) return [];

    const results = [];
    this._walkDir(absDir, absDir, safePrefix, results);
    return results;
  }

  /**
   * Return the client-accessible URL for a stored pathname.
   *
   * @param {string} pathname
   * @returns {string}
   */
  resolveUrl(pathname) {
    return `/api/storage/file/${pathname}`;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Recursively walk `dir` and push file metadata into `results`.
   *
   * @param {string} dir
   * @param {string} baseDir  Root directory used to build relative pathnames
   * @param {string} prefix
   * @param {Array}  results
   */
  _walkDir(dir, baseDir, prefix, results) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absEntry = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this._walkDir(absEntry, baseDir, prefix, results);
      } else if (entry.isFile()) {
        const relPath = path.relative(this.basePath, absEntry).replace(/\\/g, '/');
        const stat    = fs.statSync(absEntry);
        results.push({ pathname: relPath, createdAt: stat.mtime });
      }
    }
  }
}
