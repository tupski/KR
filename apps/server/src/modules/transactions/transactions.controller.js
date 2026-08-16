/**
 * @file transactions.controller.js
 * @description HTTP request handlers for transaction endpoints.
 * Validates input with Zod, delegates business logic to transactions.service.
 */

import { z } from 'zod';
import * as txService from './transactions.service.js';
import { ValidationError } from '../../middleware/errorHandler.js';

// ── Input schemas ─────────────────────────────────────────────────────────────

const createTransactionSchema = z.object({
  customer_name:      z.string().min(1, 'customer_name is required'),
  apartment_location: z.string().min(1, 'apartment_location is required'),
  room_number:        z.string().min(1, 'room_number is required'),
  check_in:           z.string().min(1, 'check_in is required'),
  check_out:          z.string().min(1, 'check_out is required'),
  duration_days:      z.number().int().positive(),
  price_per_day:      z.number().nonnegative(),
  total_price:        z.number().nonnegative(),
  payment_cash:       z.number().nonnegative().default(0),
  payment_transfer:   z.number().nonnegative().default(0),
  deposit_cash:       z.number().nonnegative().default(0),
  deposit_transfer:   z.number().nonnegative().default(0),
  marketing_name:     z.string().optional().nullable(),
  marketing_fee:      z.number().nonnegative().default(0),
  ktp_image_url:      z.string().url().optional().nullable(),
  transfer_proof_url: z.string().url().optional().nullable(),
  guest_source:       z.string().optional().nullable(),
  notes:              z.string().optional().nullable(),
  checkin_at:         z.string().optional().nullable(),
});

const updateTransactionSchema = createTransactionSchema.partial();

const returnDepositSchema = z.object({
  refundProofUrl: z.string().url().optional().nullable(),
});

const summaryQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate:   z.string().optional(),
  location:  z.string().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validate data against a Zod schema. Throws ValidationError on failure.
 *
 * @template T
 * @param {z.ZodSchema<T>} schema
 * @param {unknown} data
 * @returns {T}
 */
function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Validation failed', result.error.flatten().fieldErrors);
  }
  return result.data;
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/transactions
 * List transactions with pagination and optional filters.
 *
 * @type {import('express').RequestHandler}
 */
export async function listTransactions(req, res, next) {
  try {
    const { page, limit, startDate, endDate, location, search, userId } = req.query;
    const result = await txService.listTransactions({
      page:      Number(page)  || 1,
      limit:     Number(limit) || 20,
      startDate: startDate || undefined,
      endDate:   endDate   || undefined,
      location:  location  || undefined,
      userId:    userId    || undefined,
      search:    search    || undefined,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/transactions/summary
 * Dashboard KPI summary (admin/super_admin only).
 *
 * @type {import('express').RequestHandler}
 */
export async function getDashboardSummary(req, res, next) {
  try {
    const { startDate, endDate, location } = validate(summaryQuerySchema, req.query);
    const summary = await txService.getDashboardSummary({ startDate, endDate, location });
    res.status(200).json({ summary });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/transactions/:id
 * Get a single transaction by ID.
 *
 * @type {import('express').RequestHandler}
 */
export async function getTransactionById(req, res, next) {
  try {
    const transaction = await txService.getTransactionById(req.params.id);
    res.status(200).json({ transaction });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/transactions
 * Create a new transaction (requireAuth).
 *
 * @type {import('express').RequestHandler}
 */
export async function createTransaction(req, res, next) {
  try {
    const data        = validate(createTransactionSchema, req.body);
    const transaction = await txService.createTransaction(data, req.user.id);
    res.status(201).json({ transaction });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/transactions/:id
 * Update a transaction (owner or admin/super_admin).
 *
 * @type {import('express').RequestHandler}
 */
export async function updateTransaction(req, res, next) {
  try {
    const data        = validate(updateTransactionSchema, req.body);
    const transaction = await txService.updateTransaction(req.params.id, data, req.user);
    res.status(200).json({ transaction });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/transactions/:id
 * Delete a transaction (owner or admin/super_admin).
 *
 * @type {import('express').RequestHandler}
 */
export async function deleteTransaction(req, res, next) {
  try {
    await txService.deleteTransaction(req.params.id, req.user);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/transactions/:id/return-deposit
 * Mark the deposit as returned.
 *
 * @type {import('express').RequestHandler}
 */
export async function returnDeposit(req, res, next) {
  try {
    const { refundProofUrl } = validate(returnDepositSchema, req.body);
    const transaction = await txService.markDepositReturned(
      req.params.id,
      { refundProofUrl },
      req.user.id,
    );
    res.status(200).json({ transaction });
  } catch (err) {
    next(err);
  }
}
