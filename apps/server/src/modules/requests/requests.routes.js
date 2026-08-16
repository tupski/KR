/**
 * @file requests.routes.js
 * @description Express router for employee request endpoints.
 * Mounted at /api/requests in app.js.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.middleware.js';
import * as ctrl from './requests.controller.js';

const router = Router();

const adminOnly = requireRole('admin', 'super_admin');

router.get('/',           requireAuth, ctrl.listRequests);
router.post('/',          requireAuth, ctrl.createRequest);
router.get('/:id',        requireAuth, ctrl.getRequestById);
router.put('/:id/status', adminOnly,   ctrl.updateRequestStatus);
router.delete('/:id',     adminOnly,   ctrl.deleteRequest);

export default router;
