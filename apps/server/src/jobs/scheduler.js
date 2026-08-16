/**
 * @file scheduler.js
 * @description Cron job scheduler using node-cron.
 * All schedules are in UTC; server runs at UTC, WIB = UTC+7.
 *
 * Schedule notes:
 *   - Generate notifications: 06:00 WIB = 23:00 UTC previous day → '0 23 * * *'
 *   - Cleanup storage:        02:00 WIB Sunday = 19:00 UTC Saturday → '0 19 * * 0'
 */

import cron from 'node-cron';
import { runGenerateNotifications } from './generateNotifications.job.js';
import { runCleanup } from './cleanupStorage.job.js';

/**
 * Start all scheduled background jobs.
 * Call once after the database is confirmed reachable.
 *
 * @returns {void}
 */
export function startScheduler() {
  // ── Generate notifications: daily at 06:00 WIB (23:00 UTC) ────────────────
  cron.schedule('0 23 * * *', async () => {
    console.log('[cron] Running generateNotifications job…');
    try {
      const result = await runGenerateNotifications();
      console.log(`[cron] generateNotifications done — created: ${result.created}, ok: ${result.ok}`);
      if (!result.ok) {
        const errors = Object.entries(result.sections)
          .filter(([, s]) => s.error)
          .map(([k, s]) => `${k}: ${s.error}`)
          .join('; ');
        console.warn(`[cron] generateNotifications partial errors — ${errors}`);
      }
    } catch (err) {
      console.error('[cron] generateNotifications fatal error:', err);
    }
  });

  // ── Cleanup storage: every Sunday at 02:00 WIB (19:00 UTC Saturday) ───────
  cron.schedule('0 19 * * 0', async () => {
    console.log('[cron] Running cleanupStorage job…');
    try {
      const result = await runCleanup({ days: 30 });
      console.log('[cron] cleanupStorage done:', result);
    } catch (err) {
      console.error('[cron] cleanupStorage fatal error:', err);
    }
  });

  console.log('✅ Scheduler started (generateNotifications @ 23:00 UTC, cleanupStorage @ 19:00 UTC Sun)');
}
