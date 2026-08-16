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

router.get('/',              requireAuth, ctrl.listLocations);
router.get('/stats',         requireAuth, ctrl.getLocationStats);
router.get('/rooms',         requireAuth, ctrl.listRoomsWithOccupancy);
router.get('/rooms/report',  requireAuth, ctrl.listRoomsForReport);
router.post('/',             superAdminOnly, ctrl.createLocation);
router.post('/rooms',        superAdminOnly, ctrl.createRoom);
router.delete('/:name',      superAdminOnly, ctrl.deleteLocation);
router.delete('/rooms/:id',  superAdminOnly, ctrl.deleteRoom);

export default router;
