/**
 * @file finance.controller.js
 * @description HTTP handlers for finance endpoints.
 * Covers tagihan bulanan, fee marketing, and deposit management.
 */

import * as financeService from './finance.service.js';
import { ValidationError } from '../../middleware/errorHandler.js';

// ── Tagihan Bulanan ───────────────────────────────────────────────────────────

/** GET /api/finance/tagihan-bulanan */
export async function listTagihanBulanan(req, res, next) {
  try {
    const { page, limit, status, location, roomNumber } = req.query;
    const result = await financeService.listTagihanBulanan({
      page:       page       || undefined,
      limit:      limit      || undefined,
      status:     status     || undefined,
      location:   location   || undefined,
      roomNumber: roomNumber || undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
}

/** GET /api/finance/tagihan-bulanan/:id */
export async function getTagihanBulananById(req, res, next) {
  try {
    const data = await financeService.getTagihanBulananById(req.params.id);
    res.json({ data });
  } catch (err) { next(err); }
}

/** POST /api/finance/tagihan-bulanan */
export async function createTagihanBulanan(req, res, next) {
  try {
    const { apartment_location, room_number, amount, due_date, is_recurring } = req.body;
    if (!apartment_location || !room_number || !amount || !due_date) {
      throw new ValidationError('apartment_location, room_number, amount, due_date are required');
    }
    const data = await financeService.createTagihanBulanan(
      { apartment_location, room_number, amount, due_date, is_recurring },
      req.user.id,
    );
    res.status(201).json({ data });
  } catch (err) { next(err); }
}

/** PUT /api/finance/tagihan-bulanan/:id/pay */
export async function payTagihanBulanan(req, res, next) {
  try {
    const { proof_url } = req.body;
    const result = await financeService.payTagihanBulanan(
      req.params.id,
      proof_url ?? null,
      req.user.id,
    );
    res.json({ data: result });
  } catch (err) { next(err); }
}

/** DELETE /api/finance/tagihan-bulanan/:id */
export async function deleteTagihanBulanan(req, res, next) {
  try {
    await financeService.deleteTagihanBulanan(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
}

// ── Fee Marketing ─────────────────────────────────────────────────────────────

/** GET /api/finance/fee-lunas */
export async function listFeeLunas(req, res, next) {
  try {
    const { page, limit, startDate, endDate, marketingName } = req.query;
    const result = await financeService.listTagihanFeeLunas({
      page:          page          || undefined,
      limit:         limit         || undefined,
      startDate:     startDate     || undefined,
      endDate:       endDate       || undefined,
      marketingName: marketingName || undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
}

/** GET /api/finance/fee-unpaid */
export async function listFeeUnpaid(req, res, next) {
  try {
    const { marketingName, startDate, endDate } = req.query;
    const data = await financeService.listUnpaidFeeItems({
      marketingName: marketingName || undefined,
      startDate:     startDate     || undefined,
      endDate:       endDate       || undefined,
    });
    res.json({ data });
  } catch (err) { next(err); }
}

/** POST /api/finance/fee-pay */
export async function payFeeItems(req, res, next) {
  try {
    const { marketing_name, transaction_ids, proof_url } = req.body;
    if (!marketing_name || !Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      throw new ValidationError('marketing_name and transaction_ids[] are required');
    }
    const result = await financeService.payFeeItems(
      marketing_name,
      transaction_ids,
      proof_url ?? null,
      req.user.id,
    );
    res.json({ data: result });
  } catch (err) { next(err); }
}

// ── Deposits ──────────────────────────────────────────────────────────────────

/** GET /api/finance/deposits */
export async function listDeposits(req, res, next) {
  try {
    const { page, limit, location, returned } = req.query;
    const result = await financeService.listTransactionsWithDeposit({
      page:     page     || undefined,
      limit:    limit    || undefined,
      location: location || undefined,
      returned: returned || undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
}
