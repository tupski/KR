/**
 * @file mime.js
 * @description Synchronous MIME-type lookup helper.
 * Uses the `mime-types` npm package when available; falls back to a
 * small built-in map so local.provider.js works before `npm install`.
 */

import { createRequire } from 'module';

/** @type {Record<string, string>} */
const FALLBACK_MAP = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.pdf':  'application/pdf',
  '.txt':  'text/plain',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.mp4':  'video/mp4',
  '.mp3':  'audio/mpeg',
};

// Try to load mime-types synchronously; gracefully fall back if not installed
let _mimeTypes = null;
try {
  const require = createRequire(import.meta.url);
  _mimeTypes = require('mime-types');
} catch {
  // mime-types not yet installed — will use FALLBACK_MAP
}

/**
 * Return the MIME type for a given file path or extension.
 *
 * @param {string} filePath  Full path or just the extension (e.g. '.jpg')
 * @returns {string|undefined}
 */
export function lookupMime(filePath) {
  if (_mimeTypes) {
    return _mimeTypes.lookup(filePath) || undefined;
  }
  const ext = filePath.includes('.')
    ? filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
    : filePath.toLowerCase();
  return FALLBACK_MAP[ext];
}
