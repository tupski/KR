/**
 * @file transactions.routes.js
 * @description Express router for transaction endpoints.
 *
 * Mounted at /api/transactions in app.js.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.middleware.js';
import {
  listTransactions,
  getDashboardSummary,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  returnDeposit,
} from './transactions.controller.js';

const router = Router();

// All transaction routes require authentication
router.use(requireAuth);

// ── Summary (must be before /:id to avoid route conflict) ────────────────────
router.get('/summary', requireRole('admin', 'super_admin'), getDashboardSummary);

// ── Collection routes ─────────────────────────────────────────────────────────
router.get('/',  listTransactions);
router.post('/', createTransaction);

// ── Single-resource routes ────────────────────────────────────────────────────
router.get('/:id',                getTransactionById);
router.put('/:id',                updateTransaction);
router.delete('/:id',             deleteTransaction);
router.post('/:id/return-deposit', returnDeposit);

export default router;
