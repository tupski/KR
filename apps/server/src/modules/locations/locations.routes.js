/**
 * @file locations.routes.js
 * @description Express router for apartment location endpoints.
 * Mounted at /api/locations in app.js.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.middleware.js';
import * as ctrl from './locations.controller.js';

const router = Router();

const superAdminOnly = requireRole('super_admin');

router.get('/',          requireAuth,    ctrl.listLocations);
router.post('/',         superAdminOnly, ctrl.createLocation);
router.delete('/:name',  superAdminOnly, ctrl.deleteLocation);

export default router;
