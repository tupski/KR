/**
 * @file activityLogs.routes.js
 * @description Express router for activity log endpoints.
 * Mounted at /api/activity-logs in app.js.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.middleware.js';
import * as ctrl from './activityLogs.controller.js';

const router = Router();

// Read: admin only; Write: any authenticated user (internal frontend logging)
router.get('/',  requireRole('admin', 'super_admin'), ctrl.listActivityLogs);
router.post('/', requireAuth,                         ctrl.logActivity);

export default router;
