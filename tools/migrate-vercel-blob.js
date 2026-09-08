#!/usr/bin/env node
/* eslint-env node */
/* global process */

/**
 * Vercel Blob -> target storage (local / S3 / R2) migration.
 *
 * Guarantees:
 *  - COPY-ONLY: never deletes or mutates the source.
 *  - RESUMABLE: every run writes JSONL manifests; resume reads ALL previous
 *    manifests and skips objects already verified by SHA-256.
 *  - CHECKSUM-VERIFIED: an object counts as migrated only after the target
 *    content re-reads back with matching SHA-256 and size.
 *  - ATOMIC local writes: download -> hash -> write to temp -> fsync -> rename.
 *    A partially copied file can never masquerade as success.
 *  - The canonical target key is the ORIGINAL Vercel Blob pathname
 *    (already collision-free thanks to addRandomSuffix at upload time),
 *    normalized against traversal.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { LocalStorageDriver, sanitizeStorageKey } from '../server/storage/local.js';
import { S3StorageDriver } from '../server/storage/s3.js';

dotenv.config();

const VERCEL_BLOB_TOKEN =
  process.env.MIGRATION_VERCEL_BLOB_TOKEN ||
  process.env.BLOB_READ_WRITE_TOKEN ||
  '';
const STORAGE_DRIVER = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
const LOCAL_STORAGE_PATH = process.env.LOCAL_STORAGE_PATH || path.resolve(process.cwd(), 'storage');
const MIGRATION_ROOT = path.resolve(process.cwd(), 'migration', 'blobs');
const CONCURRENCY = Math.max(1, Number(process.env.MIGRATION_CONCURRENCY || 3));
const MAX_RETRIES = Math.max(0, Number(process.env.MIGRATION_MAX_RETRIES || 3));

function fail(msg) {
  console.error(`[BLOB] ERROR: ${msg}`);
  process.exit(1);
}

function makeDriver() {
  if (STORAGE_DRIVER === 's3' || STORAGE_DRIVER === 'r2') {
    return new S3StorageDriver();
  }
  return new LocalStorageDriver(LOCAL_STORAGE_PATH);
}

function calculateSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** Canonical target key = sanitized original pathname. No renaming, no guessing. */
export function toCanonicalStorageKey(blobPathnameOrUrl) {
  return sanitizeStorageKey(blobPathnameOrUrl);
}

async function listAllBlobs(token) {
  let listFn;
  try {
    const mod = await import('@vercel/blob');
    listFn = mod.list;
  } catch (_e) {
    // Direct REST fallback (documented Vercel Blob list API) if SDK absent.
    listFn = async ({ token, cursor, limit }) => {
      const url = new URL('https://blob.vercel-storage.com');
      if (cursor) url.searchParams.set('cursor', cursor);
      url.searchParams.set('limit', String(limit ?? 1000));
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Vercel Blob list API ${res.status}`);
      return res.json();
    };
  }

  let cursor;
  let hasMore = true;
  const all = [];
  while (hasMore) {
    const page = await listFn({ token, cursor, limit: 1000 });
    all.push(...(page.blobs || []));
    hasMore = Boolean(page.hasMore);
    cursor = page.cursor;
    console.log(`[BLOB] discovery: ${all.length} objek ditemukan sejauh ini…`);
  }
  return all;
}

/** Read every manifest.jsonl under migration/blobs/** and index verified keys. */
function loadPreviousManifests() {
  const done = new Map(); // key -> { sha256, size, status }
  if (!fs.existsSync(MIGRATION_ROOT)) return done;
  for (const runDir of fs.readdirSync(MIGRATION_ROOT)) {
    const manifest = path.join(MIGRATION_ROOT, runDir, 'manifest.jsonl');
    if (!fs.existsSync(manifest)) continue;
    for (const line of fs.readFileSync(manifest, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (!rec.targetKey) continue;
        if (rec.status === 'success') done.set(rec.targetKey, rec);
        else if (rec.status === 'failed' && done.has(rec.targetKey)) {
          // A later success overrides an earlier failure; a later failure does
          // NOT un-verify an earlier success (file still on disk).
        }
      } catch (_e) {
        // Skip malformed manifest lines rather than crash the whole run.
      }
    }
  }
  return done;
}

async function targetChecksum(driver, key) {
  try {
    const data = await driver.get(key);
    if (!data) return null;
    return { sha256: calculateSha256(data), size: data.length };
  } catch (_e) {
    return null;
  }
}

async function downloadWithRetry(url, token, attempts) {
  let lastErr;
  for (let i = 0; i <= attempts; i++) {
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr;
}

async function migrate({ mode }) {
  if (!VERCEL_BLOB_TOKEN) fail('MIGRATION_VERCEL_BLOB_TOKEN (atau BLOB_READ_WRITE_TOKEN) wajib diset.');

  const driver = makeDriver();
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const runDir = path.join(MIGRATION_ROOT, stamp);
  fs.mkdirSync(runDir, { recursive: true });
  const manifestPath = path.join(runDir, 'manifest.jsonl');
  const manifestStream = fs.createWriteStream(manifestPath, { flags: 'a' });
  const writeRecord = (rec) => manifestStream.write(JSON.stringify(rec) + '\n');

  console.log(`[BLOB] driver=${STORAGE_DRIVER} mode=${mode} concurrency=${CONCURRENCY}`);
  const previous = loadPreviousManifests();
  console.log(`[BLOB] manifest sebelumnya: ${previous.size} objek terverifikasi sukses.`);

  const blobs = await listAllBlobs(VERCEL_BLOB_TOKEN);
  console.log(`[BLOB] total objek sumber: ${blobs.length}`);

  const summary = { total: blobs.length, migrated: 0, skipped: 0, mismatched: 0, failed: 0 };
  let index = 0;

  async function worker() {
    while (index < blobs.length) {
      const i = index++;
      const blob = blobs[i];
      const sourcePath = blob.pathname || new URL(blob.url).pathname.replace(/^\/+/, '');
      let targetKey;
      try {
        targetKey = toCanonicalStorageKey(sourcePath);
      } catch (err) {
        summary.failed++;
        writeRecord({ sourceUrl: blob.url, pathname: blob.pathname, targetKey: null, size: blob.size ?? null, status: 'failed', error: `canonical key: ${err.message}` });
        continue;
      }

      const prev = previous.get(targetKey);
      if (prev && mode !== 'retry-failed') {
        // Verify existing target instead of trusting the manifest blindly only
        // when size is known; SHA from manifest is authoritative for skip.
        if (prev.sha256) {
          summary.skipped++;
          writeRecord({ sourceUrl: blob.url, pathname: blob.pathname, targetKey, size: blob.size ?? prev.size, sha256: prev.sha256, status: 'skipped', note: 'verified in previous manifest' });
          continue;
        }
      }
      if (mode === 'retry-failed' && prev?.sha256) {
        summary.skipped++;
        continue;
      }

      try {
        const buffer = await downloadWithRetry(blob.downloadUrl || blob.url, VERCEL_BLOB_TOKEN, MAX_RETRIES);
        const sourceSha = calculateSha256(buffer);
        const expectedSize = blob.size ?? buffer.length;
        if (buffer.length !== expectedSize) {
          throw new Error(`size mismatch: source meta ${expectedSize} vs downloaded ${buffer.length}`);
        }

        const existing = await targetChecksum(driver, targetKey);
        if (existing) {
          if (existing.sha256 === sourceSha && existing.size === buffer.length) {
            summary.skipped++;
            writeRecord({ sourceUrl: blob.url, pathname: blob.pathname, targetKey, size: buffer.length, sha256: sourceSha, status: 'skipped', note: 'target already identical' });
            continue;
          }
          // Different content at target: do NOT overwrite blindly.
          summary.mismatched++;
          writeRecord({ sourceUrl: blob.url, pathname: blob.pathname, targetKey, size: buffer.length, sha256: sourceSha, targetSha256: existing.sha256, status: 'mismatch', error: 'target exists with different content — manual review required' });
          console.error(`[BLOB] ✗ MISMATCH ${targetKey} (target berbeda, tidak ditimpa)`);
          continue;
        }

        await driver.upload(targetKey, buffer, { contentType: blob.contentType || undefined });

        const verify = await targetChecksum(driver, targetKey);
        if (!verify || verify.sha256 !== sourceSha || verify.size !== buffer.length) {
          throw new Error('verifikasi pasca-tulis gagal (checksum/size tidak cocok)');
        }

        summary.migrated++;
        writeRecord({ sourceUrl: blob.url, pathname: blob.pathname, targetKey, size: buffer.length, sha256: sourceSha, contentType: blob.contentType || null, uploadedAt: blob.uploadedAt || null, status: 'success' });
        console.log(`[BLOB] ✓ [${i + 1}/${blobs.length}] ${targetKey}`);
      } catch (err) {
        summary.failed++;
        writeRecord({ sourceUrl: blob.url, pathname: blob.pathname, targetKey, size: blob.size ?? null, status: 'failed', error: err.message });
        console.error(`[BLOB] ✗ [${i + 1}/${blobs.length}] ${targetKey}: ${err.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  manifestStream.end();

  console.log('\n--- BLOB MIGRATION SUMMARY ---');
  console.log(`Total objects: ${summary.total}`);
  console.log(`Migrated     : ${summary.migrated}`);
  console.log(`Skipped      : ${summary.skipped}`);
  console.log(`Mismatched   : ${summary.mismatched}`);
  console.log(`Failed       : ${summary.failed}`);
  console.log(`Manifest     : ${manifestPath}`);
  if (summary.failed > 0 || summary.mismatched > 0) process.exitCode = 1;
}

function printUsage() {
  console.log(`
Usage: node tools/migrate-vercel-blob.js <command>

Commands:
  migrate       Copy all objects (skip already-verified via previous manifests)
  resume        Same as migrate — inherently resumable
  retry-failed  Re-attempt objects that previously failed (successes still skipped)

Environment:
  MIGRATION_VERCEL_BLOB_TOKEN  source token (read)
  STORAGE_DRIVER               local (default) | s3 | r2
  LOCAL_STORAGE_PATH           target dir for local driver
  MIGRATION_CONCURRENCY        parallel downloads (default 3)
  MIGRATION_MAX_RETRIES        per-object retry count (default 3)
`);
}

const command = process.argv[2];
switch (command) {
  case 'migrate':
  case 'resume':
    migrate({ mode: 'migrate' });
    break;
  case 'retry-failed':
    migrate({ mode: 'retry-failed' });
    break;
  default:
    printUsage();
    process.exit(command ? 1 : 0);
}
