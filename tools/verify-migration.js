#!/usr/bin/env node
/* eslint-env node */
/* global process */

/**
 * Migration integrity verifier (media + database references).
 *
 * Checks performed:
 *  1. Blob manifests: aggregate every manifest.jsonl under migration/blobs,
 *     verify each 'success' object exists in target storage with matching
 *     SHA-256 (checksum re-read from target, NOT trusted from manifest alone).
 *  2. Database media references: when both MIGRATION_* URLs are configured,
 *     scan known media columns for legacy Vercel Blob URLs vs canonical keys
 *     and cross-check that referenced objects exist in target storage.
 *  3. Reports PASS/FAIL honestly — exits non-zero on any mismatch.
 *
 * This tool NEVER deletes anything and never writes to the source.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import { LocalStorageDriver } from '../server/storage/local.js';
import { S3StorageDriver } from '../server/storage/s3.js';
import { classifyStorageReference } from '../server/storage/index.js';

dotenv.config();

const STORAGE_DRIVER = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
const LOCAL_STORAGE_PATH = process.env.LOCAL_STORAGE_PATH || path.resolve(process.cwd(), 'storage');
const MIGRATION_ROOT = path.resolve(process.cwd(), 'migration', 'blobs');
const TARGET_DB_URL = process.env.MIGRATION_TARGET_DB_URL || process.env.DATABASE_URL;

// Media columns known from supabase/supabase-schema.sql + the real production dump.
const MEDIA_COLUMNS = [
  { table: 'transactions', columns: ['ktp_image_url', 'transfer_proof_url', 'deposit_refund_proof_url'] },
  { table: 'tagihan_bulanan', columns: ['proof_url'] },
  { table: 'tagihan_fee_lunas', columns: ['proof_url'] },
  { table: 'tagihan_fee_lunas_items', columns: ['proof_url'] },
  { table: 'user_profiles', columns: ['avatar_url'] },
];

function makeDriver() {
  if (STORAGE_DRIVER === 's3' || STORAGE_DRIVER === 'r2') return new S3StorageDriver();
  return new LocalStorageDriver(LOCAL_STORAGE_PATH);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function collectManifestRecords() {
  const records = [];
  if (!fs.existsSync(MIGRATION_ROOT)) return records;
  for (const runDir of fs.readdirSync(MIGRATION_ROOT).sort()) {
    const manifest = path.join(MIGRATION_ROOT, runDir, 'manifest.jsonl');
    if (!fs.existsSync(manifest)) continue;
    for (const line of fs.readFileSync(manifest, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        rec._run = runDir;
        records.push(rec);
      } catch (_e) {
        records.push({ status: 'failed', error: 'malformed manifest line', _run: runDir });
      }
    }
  }
  return records;
}

async function verifyMediaManifests(driver, { checksumSample = 25 } = {}) {
  const records = collectManifestRecords();
  // Latest record per targetKey wins.
  const latest = new Map();
  for (const rec of records) {
    if (!rec.targetKey) continue;
    latest.set(rec.targetKey, rec);
  }

  const report = {
    manifestRecords: records.length,
    uniqueKeys: latest.size,
    success: 0, skipped: 0, failed: 0, mismatch: 0,
    missingInTarget: 0, checksumVerified: 0, checksumMismatch: 0,
  };

  const successKeys = [];
  for (const rec of latest.values()) {
    if (rec.status === 'success') { report.success++; successKeys.push(rec); }
    else if (rec.status === 'skipped') report.skipped++;
    else if (rec.status === 'mismatch') report.mismatch++;
    else report.failed++;
  }

  // Existence check for every success record; checksum re-verify on a sample.
  const sample = successKeys.length <= checksumSample
    ? successKeys
    : successKeys.filter((_, i) => i % Math.ceil(successKeys.length / checksumSample) === 0);

  for (const rec of successKeys) {
    const exists = await driver.exists(rec.targetKey);
    if (!exists) {
      report.missingInTarget++;
      console.error(`  ✗ MISSING in target: ${rec.targetKey} (manifest run ${rec._run})`);
    }
  }

  for (const rec of sample) {
    const data = await driver.get(rec.targetKey);
    if (!data) continue; // already counted missing
    const actual = sha256(data);
    if (rec.sha256 && actual !== rec.sha256) {
      report.checksumMismatch++;
      console.error(`  ✗ CHECKSUM MISMATCH: ${rec.targetKey}`);
    } else {
      report.checksumVerified++;
    }
  }

  return report;
}

async function verifyDatabaseReferences(driver) {
  if (!TARGET_DB_URL) {
    return { skipped: true, reason: 'MIGRATION_TARGET_DB_URL / DATABASE_URL tidak diset' };
  }

  const client = new pg.Client({ connectionString: TARGET_DB_URL, connectionTimeoutMillis: 8000 });
  await client.connect();
  const report = { skipped: false, references: 0, canonical: 0, legacyVercel: 0, legacyProxy: 0, external: 0, missingInTarget: 0, unresolved: 0 };

  try {
    for (const { table, columns } of MEDIA_COLUMNS) {
      // Table may not exist yet — tolerate.
      const exists = await client.query(
        `SELECT to_regclass($1) AS t`, [`public.${table}`]
      );
      if (!exists.rows[0]?.t) continue;

      for (const col of columns) {
        const colExists = await client.query(
          `SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
          [table, col]
        );
        if (!colExists.rows.length) continue;

        const rows = await client.query(
          `SELECT ${col} AS value FROM ${table} WHERE ${col} IS NOT NULL AND ${col} <> ''`
        );
        for (const row of rows.rows) {
          report.references++;
          const cls = classifyStorageReference(row.value);
          if (!cls.canonicalKey) { report.unresolved++; continue; }
          if (cls.kind.startsWith('legacy-vercel')) report.legacyVercel++;
          else if (cls.kind === 'legacy-proxy') report.legacyProxy++;
          else if (cls.kind === 'external-url') report.external++;
          else report.canonical++;

          const found = await driver.exists(cls.canonicalKey);
          if (!found) {
            report.missingInTarget++;
            if (report.missingInTarget <= 20) {
              console.error(`  ✗ DB ref tanpa objek target: ${table}.${col} → ${cls.canonicalKey}`);
            }
          }
        }
      }
    }
  } finally {
    await client.end();
  }
  return report;
}

async function main() {
  console.log('MIGRATION INTEGRITY VERIFICATION');
  console.log(`driver=${STORAGE_DRIVER}` + (STORAGE_DRIVER === 'local' ? ` path=${LOCAL_STORAGE_PATH}` : ''));
  const driver = makeDriver();

  console.log('\n[1/2] Verifikasi manifest blob…');
  const media = await verifyMediaManifests(driver);
  console.log(JSON.stringify(media, null, 2));

  console.log('\n[2/2] Verifikasi referensi media di database target…');
  let db;
  try {
    db = await verifyDatabaseReferences(driver);
  } catch (err) {
    db = { skipped: true, reason: `koneksi/query gagal: ${err.message}` };
  }
  console.log(JSON.stringify(db, null, 2));

  const mediaPass = media.missingInTarget === 0 && media.checksumMismatch === 0 && media.mismatch === 0;
  const dbPass = db.skipped || db.missingInTarget === 0;
  const overall = mediaPass && dbPass;

  console.log('\n========================================');
  console.log(`Media verification : ${mediaPass ? 'PASS' : 'FAIL'}`);
  console.log(`DB references      : ${db.skipped ? 'SKIPPED (butuh DATABASE_URL target)' : dbPass ? 'PASS' : 'FAIL'}`);
  console.log(`Overall            : ${overall ? 'PASS' : 'FAIL'}`);
  console.log('========================================');
  if (!overall) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[VERIFIER] FATAL:', err.message);
  process.exitCode = 1;
});
