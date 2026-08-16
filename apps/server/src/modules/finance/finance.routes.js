/**
 * @file finance.routes.js
 * @description Express router for finance endpoints.
 * Mounted at /api/finance in app.js.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.middleware.js';
import * as ctrl from './finance.controller.js';

const router = Router();

const adminOnly = requireRole('admin', 'super_admin');

// ── Tagihan Bulanan ───────────────────────────────────────────────────────────
router.get('/tagihan-bulanan',         adminOnly, ctrl.listTagihanBulanan);
router.post('/tagihan-bulanan',        adminOnly, ctrl.createTagihanBulanan);
router.get('/tagihan-bulanan/:id',     requireAuth, ctrl.getTagihanBulananById);
router.put('/tagihan-bulanan/:id/pay', requireAuth, ctrl.payTagihanBulanan);
router.delete('/tagihan-bulanan/:id',  adminOnly, ctrl.deleteTagihanBulanan);

// ── Fee Marketing ─────────────────────────────────────────────────────────────
router.get('/fee-lunas',  adminOnly, ctrl.listFeeLunas);
router.get('/fee-unpaid', adminOnly, ctrl.listFeeUnpaid);
router.post('/fee-pay',   adminOnly, ctrl.payFeeItems);

// ── Deposits ──────────────────────────────────────────────────────────────────
router.get('/deposits', adminOnly, ctrl.listDeposits);

export default router;
