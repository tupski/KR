/**
 * @file pengeluaran.controller.js
 * @description HTTP request handlers for expense (pengeluaran) endpoints.
 * Validates input with Zod, delegates business logic to pengeluaran.service.
 */

import { z } from 'zod';
import * as pengeluaranService from './pengeluaran.service.js';
import { ValidationError } from '../../middleware/errorHandler.js';

// ── Input schemas ─────────────────────────────────────────────────────────────

const createPengeluaranSchema = z.object({
  nama_pengeluaran: z.string().min(1, 'nama_pengeluaran is required').max(255),
  jumlah:           z.number().nonnegative(),
  tanggal:          z.string().min(1, 'tanggal is required'),
  keterangan:       z.string().optional().nullable(),
  category:         z.string().optional().nullable(),
});

const updatePengeluaranSchema = createPengeluaranSchema.partial();

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
 * GET /api/pengeluaran
 * List expenses with pagination and optional filters.
 *
 * @type {import('express').RequestHandler}
 */
export async function listPengeluaran(req, res, next) {
  try {
    const { page, limit, startDate, endDate, category } = req.query;
    const result = await pengeluaranService.listPengeluaran({
      page:      Number(page)  || 1,
      limit:     Number(limit) || 20,
      startDate: startDate || undefined,
      endDate:   endDate   || undefined,
      category:  category  || undefined,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/pengeluaran/categories
 * List all expense categories.
 *
 * @type {import('express').RequestHandler}
 */
export async function listCategories(req, res, next) {
  try {
    const categories = await pengeluaranService.listCategories();
    res.status(200).json({ categories });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/pengeluaran
 * Create a new expense record.
 *
 * @type {import('express').RequestHandler}
 */
export async function createPengeluaran(req, res, next) {
  try {
    const data       = validate(createPengeluaranSchema, req.body);
    const pengeluaran = await pengeluaranService.createPengeluaran(data, req.user.id);
    res.status(201).json({ pengeluaran });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/pengeluaran/:id
 * Update an existing expense record.
 *
 * @type {import('express').RequestHandler}
 */
export async function updatePengeluaran(req, res, next) {
  try {
    const data       = validate(updatePengeluaranSchema, req.body);
    const pengeluaran = await pengeluaranService.updatePengeluaran(req.params.id, data, req.user.id);
    res.status(200).json({ pengeluaran });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/pengeluaran/:id
 * Delete an expense record.
 *
 * @type {import('express').RequestHandler}
 */
export async function deletePengeluaran(req, res, next) {
  try {
    await pengeluaranService.deletePengeluaran(req.params.id, req.user.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
