/**
 * @file cleanupStorage.job.js
 * @description Cleanup job for stored files.
 * Deletes files older than N days from known sensitive prefixes.
 *
 * Ported from api/cleanup-blobs.js (Vercel Blob).
 *
 * Usage:
 *   // Direct invocation
 *   import { runCleanup } from './jobs/cleanupStorage.job.js';
 *   const summary = await runCleanup({ days: 30, secret: req.headers['x-cleanup-secret'] });
 *
 *   // With node-cron
 *   import cron from 'node-cron';
 *   cron.schedule('0 2 * * *', () => runCleanup({ days: 30 }));
 */

import * as storageService from '../modules/storage/storage.service.js';

/** Default prefixes that contain sensitive user uploads */
const DEFAULT_PREFIXES = ['ktp-images/', 'transfer-proofs/'];

/**
 * Run the storage cleanup job.
 *
 * @param {object}  options
 * @param {number}  [options.days=30]            Delete files older than this many days
 * @param {string}  [options.secret]             Secret provided by the caller
 * @param {string}  [options.prefixes]           Override default prefixes to scan
 * @param {boolean} [options.dryRun=false]       If true, log but do not delete
 * @returns {Promise<{
 *   deleted: string[],
 *   skipped: string[],
 *   errors:  Array<{ pathname: string, error: string }>,
 *   dryRun:  boolean
 * }>}
 */
export async function runCleanup(options = {}) {
  const {
    days        = parseInt(process.env.CLEANUP_RETENTION_DAYS || '30', 10),
    secret,
    prefixes    = DEFAULT_PREFIXES,
    dryRun      = false,
  } = options;

  // ── Secret validation ──────────────────────────────────────────────────────
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret) {
    if (!secret || secret !== expectedSecret) {
      throw new Error('Unauthorized: invalid or missing CRON_SECRET');
    }
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const deleted = [];
  const skipped = [];
  const errors  = [];

  console.info(`🧹 Storage cleanup started (cutoff: ${cutoff.toISOString()}, dryRun: ${dryRun})`);

  for (const prefix of prefixes) {
    let files;

    try {
      files = await storageService.listFiles(prefix);
    } catch (err) {
      console.error(`  ❌ Failed to list prefix "${prefix}":`, err.message);
      errors.push({ pathname: prefix, error: err.message });
      continue;
    }

    for (const file of files) {
      const age = new Date(file.createdAt);

      if (age > cutoff) {
        skipped.push(file.pathname);
        continue;
      }

      if (dryRun) {
        console.info(`  [dry-run] Would delete: ${file.pathname} (${age.toISOString()})`);
        deleted.push(file.pathname);
        continue;
      }

      try {
        await storageService.deleteFile(file.pathname);
        console.info(`  ✅ Deleted: ${file.pathname}`);
        deleted.push(file.pathname);
      } catch (err) {
        console.error(`  ❌ Failed to delete "${file.pathname}":`, err.message);
        errors.push({ pathname: file.pathname, error: err.message });
      }
    }
  }

  const summary = {
    deleted,
    skipped,
    errors,
    dryRun,
    deletedCount: deleted.length,
    skippedCount: skipped.length,
    errorCount:   errors.length,
    cutoff:       cutoff.toISOString(),
  };

  console.info(`🧹 Cleanup complete — deleted: ${deleted.length}, skipped: ${skipped.length}, errors: ${errors.length}`);

  return summary;
}
