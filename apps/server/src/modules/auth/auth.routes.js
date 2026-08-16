/**
 * @file auth.routes.js
 * @description Express router for authentication endpoints.
 *
 * Mounted at /api/auth in app.js.
 */

import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { login, logout, refresh, session } from './auth.controller.js';

const router = Router();

// Public routes
router.post('/login',   login);
router.post('/refresh', refresh);

// Protected routes (valid JWT required)
router.post('/logout',  requireAuth, logout);
router.get('/session',  requireAuth, session);

export default router;
