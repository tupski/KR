/* eslint-env node */
/* global process */

import { LocalStorageDriver, sanitizeStorageKey, toCanonicalKey, safeFileName } from './local.js';
import { S3StorageDriver } from './s3.js';

/**
 * Storage driver registry.
 *
 * `local`  -> filesystem under LOCAL_STORAGE_PATH (default, persistent Docker volume)
 * `s3`     -> generic S3-compatible object storage
 * `r2`     -> alias for `s3` (Cloudflare R2 is S3-compatible; same implementation,
 *             configured via S3_ENDPOINT / S3_REGION=auto). No duplicate code path.
 */
const SUPPORTED_DRIVERS = new Set(['local', 's3', 'r2']);

let storageInstance = null;
let storageDriverName = null;

export function resetStorageDriver() {
  storageInstance = null;
  storageDriverName = null;
}

export function getStorageDriver(config = process.env) {
  const requested = String(config.STORAGE_DRIVER || 'local').toLowerCase();
  if (!SUPPORTED_DRIVERS.has(requested)) {
    throw new Error(`STORAGE_DRIVER tidak dikenal: "${requested}". Didukung: local, r2, s3.`);
  }

  if (storageInstance && storageDriverName === requested) return storageInstance;

  if (requested === 's3' || requested === 'r2') {
    storageInstance = new S3StorageDriver({
      bucket: config.S3_BUCKET,
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      publicDomain: config.S3_PUBLIC_DOMAIN,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
  } else {
    storageInstance = new LocalStorageDriver(config.LOCAL_STORAGE_PATH);
  }
  storageDriverName = requested;
  return storageInstance;
}

/**
 * Build a driver directly from a normalized config object (server/config.js
 * shape) without touching the module-level singleton. Used by buildServer()
 * so each Fastify instance gets an isolated driver.
 */
export function buildStorageDriver(cfg) {
  const requested = String(cfg?.storageDriver || 'local').toLowerCase();
  if (!SUPPORTED_DRIVERS.has(requested)) {
    throw new Error(`STORAGE_DRIVER tidak dikenal: "${requested}". Didukung: local, r2, s3.`);
  }
  if (requested === 's3' || requested === 'r2') {
    return new S3StorageDriver(cfg.s3);
  }
  return new LocalStorageDriver(cfg.localStoragePath);
}

export function getDriverName(config = process.env) {
  return String(config.STORAGE_DRIVER || 'local').toLowerCase();
}

/**
 * Resolve any stored media reference (legacy Vercel Blob URL, legacy
 * `/api/blob?pathname=...` proxy URL, or a canonical object key) into a
 * provider-independent canonical object key.
 *
 * Returns '' when the value cannot be deterministically converted — callers
 * must NOT guess; they should report the value for manual review.
 */
export function toCanonicalStorageKey(value) {
  return toCanonicalKey(value);
}

/**
 * Legacy-reference classifier used by migration tooling and by the API when it
 * must decide how to serve an existing database value.
 */
export function classifyStorageReference(value) {
  if (!value || typeof value !== 'string') return { kind: 'empty', canonicalKey: '' };
  const trimmed = value.trim();

  if (trimmed.startsWith('/api/blob')) {
    return { kind: 'legacy-proxy', canonicalKey: toCanonicalKey(trimmed) };
  }
  if (/blob\.vercel-storage\.com/i.test(trimmed)) {
    const isPrivate = /private\.blob\.vercel-storage\.com/i.test(trimmed);
    return { kind: isPrivate ? 'legacy-vercel-private' : 'legacy-vercel-public', canonicalKey: toCanonicalKey(trimmed) };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return { kind: 'external-url', canonicalKey: toCanonicalKey(trimmed) };
  }
  if (trimmed.startsWith('/storage/')) {
    return { kind: 'canonical', canonicalKey: toCanonicalKey(trimmed) };
  }
  return { kind: 'canonical', canonicalKey: toCanonicalKey(trimmed) };
}

/** Turn a canonical key into the URL the frontend should use. */
export function resolveStorageReference(value, config = process.env) {
  const { kind, canonicalKey } = classifyStorageReference(value);
  if (!canonicalKey) return value;
  const driver = getStorageDriver(config);
  return driver.getUrl(canonicalKey);
}

export { sanitizeStorageKey, toCanonicalKey, safeFileName };
