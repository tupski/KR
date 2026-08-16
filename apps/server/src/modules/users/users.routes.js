/**
 * @file users.routes.js
 * @description Express router for user management endpoints.
 *
 * Mounted at /api/users in app.js.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.middleware.js';
import {
  listUsers,
  getMe,
  getMyRole,
  getUserById,
  updateMyProfile,
  updateUser,
  getUserLocations,
  setUserLocations,
  toggleUserLocation,
  createUser,
  deleteUser,
  resetUserPassword,
  signOutAllDevices,
} from './users.controller.js';

const router = Router();

// All users routes require authentication
router.use(requireAuth);

// ── Own-user routes (no elevated role required) ───────────────────────────────
router.get('/me',           getMe);
router.get('/me/role',      getMyRole);
router.put('/me/profile',   updateMyProfile);

// ── Admin routes — list + create + delete ────────────────────────────────────
router.get('/',             requireRole('admin', 'super_admin'), listUsers);
router.post('/',            requireRole('super_admin'),          createUser);

// ── Per-user routes ───────────────────────────────────────────────────────────
router.get('/:id',          requireRole('admin', 'super_admin'), getUserById);
router.put('/:id',          requireRole('super_admin'),          updateUser);
router.delete('/:id',       requireRole('super_admin'),          deleteUser);
router.post('/:id/reset-password', requireRole('super_admin'),   resetUserPassword);
router.post('/:id/signout-all',    requireRole('super_admin'),   signOutAllDevices);

// ── Location assignments ──────────────────────────────────────────────────────
router.get('/:id/locations',  requireRole('admin', 'super_admin'), getUserLocations);
router.put('/:id/locations',  requireRole('super_admin'),          setUserLocations);
router.post('/:id/locations/toggle', requireRole('super_admin'),   toggleUserLocation);

export default router;
