/**
 * @file settings.routes.js
 * @description Express router for system settings and announcements endpoints.
 *
 * Mounted at /api/settings in app.js.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.middleware.js';
import {
  getAllSettings,
  getSetting,
  upsertSetting,
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from './settings.controller.js';

const router = Router();

// All settings routes require authentication
router.use(requireAuth);

// ── Announcements (must be before /:key to avoid route conflict) ──────────────
router.get('/announcements',      listAnnouncements);
router.post('/announcements',     requireRole('admin', 'super_admin'), createAnnouncement);
router.put('/announcements/:id',  requireRole('admin', 'super_admin'), updateAnnouncement);
router.delete('/announcements/:id', requireRole('admin', 'super_admin'), deleteAnnouncement);

// ── Settings ──────────────────────────────────────────────────────────────────
router.get('/',      getAllSettings);
router.get('/:key',  getSetting);
router.put('/:key',  requireRole('admin', 'super_admin'), upsertSetting);

export default router;
