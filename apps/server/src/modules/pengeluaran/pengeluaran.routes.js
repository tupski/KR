/**
 * @file pengeluaran.routes.js
 * @description Express router for expense (pengeluaran) endpoints.
 *
 * Mounted at /api/pengeluaran in app.js.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.middleware.js';
import {
  listPengeluaran,
  listCategories,
  createPengeluaran,
  updatePengeluaran,
  deletePengeluaran,
} from './pengeluaran.controller.js';

const router = Router();

// All pengeluaran routes require authentication + admin/super_admin role
router.use(requireAuth);
router.use(requireRole('admin', 'super_admin'));

// ── Categories (before /:id to avoid route conflict) ─────────────────────────
router.get('/categories', listCategories);

// ── Collection routes ─────────────────────────────────────────────────────────
router.get('/',  listPengeluaran);
router.post('/', createPengeluaran);

// ── Single-resource routes ────────────────────────────────────────────────────
router.put('/:id',    updatePengeluaran);
router.delete('/:id', deletePengeluaran);

export default router;
