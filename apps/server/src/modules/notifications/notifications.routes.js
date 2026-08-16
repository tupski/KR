/**
 * @file notifications.routes.js
 * @description Express router for notification endpoints.
 *
 * Mounted at /api/notifications in app.js.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.middleware.js';
import {
  listNotifications,
  hideNotification,
  hideNotifications,
  markNotificationsRead,
  getReadStatus,
  getHiddenStatus,
  getUnreadCount,
  getPreferences,
  updatePreferences,
  subscribePush,
  unsubscribePush,
  sendPush,
} from './notifications.controller.js';

const router = Router();

// All notification routes require authentication
router.use(requireAuth);

// ── Static sub-paths (must come before /:id routes) ──────────────────────────
router.get('/unread-count',  getUnreadCount);
router.get('/preferences',   getPreferences);
router.put('/preferences',   updatePreferences);
router.post('/subscribe',    subscribePush);
router.delete('/subscribe',  unsubscribePush);
router.post('/send',         requireRole('admin', 'super_admin'), sendPush);

// ── Bulk operations ──────────────────────────────────────────────────────────
router.post('/mark-read',    markNotificationsRead);
router.post('/hide',         hideNotifications);
router.post('/read-status',  getReadStatus);
router.post('/hidden-status', getHiddenStatus);

// ── Collection ────────────────────────────────────────────────────────────────
router.get('/', listNotifications);

// ── Per-notification actions ──────────────────────────────────────────────────
router.post('/:id/hide', hideNotification);

export default router;
