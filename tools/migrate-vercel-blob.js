#!/usr/bin/env node
/* eslint-env node */
/* global process */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const VERCEL_BLOB_TOKEN = process.env.MIGRATION_VERCEL_BLOB_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
const STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'local';
const LOCAL_STORAGE_PATH = process.env.LOCAL_STORAGE_PATH || path.resolve(process.cwd(), 'storage');

/**
 * Normalisasi Vercel Blob URL / pathname menjadi canonical storage key
 * Contoh: "https://xxx.public.blob.vercel-storage.com/uploads/ktp/img-123.webp" -> "uploads/ktp/img-123.webp"
 */
export function toCanonicalStorageKey(input) {
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

  return pathname
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .replace(/\.\./g, '');
}

function calculateSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function saveToLocal(canonicalKey, buffer) {
  const targetPath = path.join(LOCAL_STORAGE_PATH, canonicalKey);
  const targetDir = path.dirname(targetPath);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(targetPath, buffer);
}

async function verifyLocal(canonicalKey, expectedSize, expectedSha256) {
  const targetPath = path.join(LOCAL_STORAGE_PATH, canonicalKey);
  if (!fs.existsSync(targetPath)) return false;
  const stat = fs.statSync(targetPath);
  if (stat.size !== expectedSize) return false;
  const buffer = fs.readFileSync(targetPath);
  return calculateSha256(buffer) === expectedSha256;
}

async function fetchBlobObjects(token) {
  let listFn;
  try {
    const mod = await import('@vercel/blob');
    listFn = mod.list;
  } catch (_e) {
    // Fallback direct REST API jika package @vercel/blob belum terinstall di runtime
    listFn = async ({ token, cursor, limit }) => {
      const url = new URL('https://blob.vercel-storage.com');
      if (cursor) url.searchParams.set('cursor', cursor);
      if (limit) url.searchParams.set('limit', String(limit));
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Vercel Blob API error: ${res.status} ${res.statusText}`);
      return res.json();
    };
  }

  let hasMore = true;
  let cursor;
  const allBlobs = [];

  while (hasMore) {
    const listResult = await listFn({
      token,
      cursor,
      limit: 500,
    });
    const items = listResult.blobs || listResult.folders || [];
    allBlobs.push(...items);
    hasMore = Boolean(listResult.hasMore);
    cursor = listResult.cursor;
  }

  return allBlobs;
}

async function migrateBlobs({ retryFailed = false } = {}) {
  if (!VERCEL_BLOB_TOKEN) {
    console.error('ERROR: MIGRATION_VERCEL_BLOB_TOKEN or BLOB_READ_WRITE_TOKEN is required.');
    process.exit(1);
  }

  console.log(`[BLOB MIGRATE] Starting migration from Vercel Blob...`);
  console.log(`[BLOB MIGRATE] Target driver: ${STORAGE_DRIVER}`);
  if (STORAGE_DRIVER === 'local') {
    console.log(`[BLOB MIGRATE] Local destination: ${LOCAL_STORAGE_PATH}`);
  }

  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const migrationDir = path.resolve(process.cwd(), 'migration', 'blobs', timestamp);
  fs.mkdirSync(migrationDir, { recursive: true });
  const manifestPath = path.join(migrationDir, 'manifest.jsonl');

  console.log(`[BLOB MIGRATE] Discovering objects in Vercel Blob...`);
  let blobs = [];
  try {
    blobs = await fetchBlobObjects(VERCEL_BLOB_TOKEN);
    console.log(`[BLOB MIGRATE] Discovered ${blobs.length} objects.`);
  } catch (err) {
    console.error(`[BLOB MIGRATE] Failed to fetch blobs list:`, err.message);
    process.exit(1);
  }

  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const manifestStream = fs.createWriteStream(manifestPath, { flags: 'a', encoding: 'utf8' });

  for (let i = 0; i < blobs.length; i++) {
    const blob = blobs[i];
    const canonicalKey = toCanonicalStorageKey(blob.pathname || blob.url);
    const progress = `[${i + 1}/${blobs.length}]`;

    try {
      if (STORAGE_DRIVER === 'local' && fs.existsSync(path.join(LOCAL_STORAGE_PATH, canonicalKey))) {
        const stat = fs.statSync(path.join(LOCAL_STORAGE_PATH, canonicalKey));
        if (stat.size === blob.size && !retryFailed) {
          skippedCount++;
          manifestStream.write(JSON.stringify({
            sourceUrl: blob.url,
            pathname: blob.pathname,
            targetKey: canonicalKey,
            size: blob.size,
            status: 'skipped',
          }) + '\n');
          continue;
        }
      }

      // Download from Vercel Blob
      const response = await fetch(blob.downloadUrl || blob.url, {
        headers: {
          Authorization: `Bearer ${VERCEL_BLOB_TOKEN}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const sha256 = calculateSha256(buffer);

      if (STORAGE_DRIVER === 'local') {
        await saveToLocal(canonicalKey, buffer);
        const verified = await verifyLocal(canonicalKey, blob.size, sha256);
        if (!verified) throw new Error('Local verification failed after write.');
      }

      successCount++;
      manifestStream.write(JSON.stringify({
        sourceUrl: blob.url,
        pathname: blob.pathname,
        targetKey: canonicalKey,
        size: blob.size,
        sha256,
        status: 'success',
      }) + '\n');
      console.log(`${progress} ✓ ${canonicalKey}`);
    } catch (err) {
      failedCount++;
      manifestStream.write(JSON.stringify({
        sourceUrl: blob.url,
        pathname: blob.pathname,
        targetKey: canonicalKey,
        size: blob.size,
        status: 'failed',
        error: err.message,
      }) + '\n');
      console.error(`${progress} ✗ ${canonicalKey} Error: ${err.message}`);
    }
  }

  manifestStream.end();
  console.log('\n--- BLOB MIGRATION SUMMARY ---');
  console.log(`Total Objects : ${blobs.length}`);
  console.log(`Success       : ${successCount}`);
  console.log(`Skipped       : ${skippedCount}`);
  console.log(`Failed        : ${failedCount}`);
  console.log(`Manifest Log  : ${manifestPath}`);
}

function printUsage() {
  console.log(`
Usage: node tools/migrate-vercel-blob.js <command> [options]

Commands:
  migrate             Copy all objects from Vercel Blob to target storage
  resume              Continue previous migration run, skipping verified files
  retry-failed        Retry files marked as failed in previous runs

Environment variables:
  MIGRATION_VERCEL_BLOB_TOKEN  Vercel Blob token (Read/Write)
  STORAGE_DRIVER               Target driver: local (default), r2, s3
  LOCAL_STORAGE_PATH           Target directory for local driver (default: ./storage)
  `);
}

const command = process.argv[2];

switch (command) {
  case 'migrate':
  case 'resume':
    migrateBlobs({ retryFailed: false });
    break;
  case 'retry-failed':
    migrateBlobs({ retryFailed: true });
    break;
  default:
    printUsage();
    process.exit(command ? 1 : 0);
}
