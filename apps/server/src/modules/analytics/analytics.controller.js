/**
 * @file analytics.controller.js
 * @description HTTP handlers for analytics endpoints.
 * Parses query params, delegates to analytics.service, returns JSON.
 */

import * as analyticsService from './analytics.service.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract common analytics query params from request.
 * @param {import('express').Request} req
 * @returns {{ startDate?: string, endDate?: string, location?: string }}
 */
function commonParams(req) {
  const { startDate, endDate, location } = req.query;
  return {
    startDate: startDate || undefined,
    endDate:   endDate   || undefined,
    location:  location  || undefined,
  };
}

/**
 * Extract pagination params from request.
 * @param {import('express').Request} req
 * @returns {{ limit: number, offset: number }}
 */
function paginationParams(req) {
  const limit  = Math.min(Number(req.query.limit  ?? 20), 100);
  const offset = Math.max(Number(req.query.offset ?? 0),  0);
  return { limit: Number.isFinite(limit) ? limit : 20, offset: Number.isFinite(offset) ? offset : 0 };
}

// ── Controllers ───────────────────────────────────────────────────────────────

/** GET /api/analytics/kpis */
export async function getKpis(req, res, next) {
  try {
    const data = await analyticsService.getDashboardKpis(commonParams(req));
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/occupancy */
export async function getOccupancy(req, res, next) {
  try {
    const data = await analyticsService.getOccupancyPerUnit({
      ...commonParams(req),
      ...paginationParams(req),
    });
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/location-fullness */
export async function getLocationFullness(req, res, next) {
  try {
    const data = await analyticsService.getLocationFullness(commonParams(req));
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/stay-duration */
export async function getStayDuration(req, res, next) {
  try {
    const data = await analyticsService.getStayDurationSummary(commonParams(req));
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/marketing */
export async function getMarketing(req, res, next) {
  try {
    const data = await analyticsService.getMarketingPerformance({
      ...commonParams(req),
      ...paginationParams(req),
    });
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/payment-methods */
export async function getPaymentMethods(req, res, next) {
  try {
    const data = await analyticsService.getPaymentMethodSummary(commonParams(req));
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/guest-sources */
export async function getGuestSources(req, res, next) {
  try {
    const data = await analyticsService.getGuestSourceSummary({
      ...commonParams(req),
      ...paginationParams(req),
    });
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/repeat-guests */
export async function getRepeatGuests(req, res, next) {
  try {
    const data = await analyticsService.getRepeatGuestSummary({
      ...commonParams(req),
      ...paginationParams(req),
    });
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/employee-performance */
export async function getEmployeePerformance(req, res, next) {
  try {
    const data = await analyticsService.getEmployeePerformance({
      ...commonParams(req),
      ...paginationParams(req),
    });
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/shift-performance */
export async function getShiftPerformance(req, res, next) {
  try {
    const data = await analyticsService.getShiftPerformance(commonParams(req));
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/checkin-heatmap */
export async function getCheckinHeatmap(req, res, next) {
  try {
    const data = await analyticsService.getCheckinHeatmap(commonParams(req));
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/daily-revenue */
export async function getDailyRevenue(req, res, next) {
  try {
    const data = await analyticsService.getDailyRevenueTrend({
      ...commonParams(req),
      ...paginationParams(req),
    });
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/monthly-revenue */
export async function getMonthlyRevenue(req, res, next) {
  try {
    const data = await analyticsService.getMonthlyRevenueTrend(commonParams(req));
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/net-profit */
export async function getNetProfit(req, res, next) {
  try {
    const data = await analyticsService.getNetProfitSummary(commonParams(req));
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/yoy-comparison */
export async function getYoyComparison(req, res, next) {
  try {
    const data = await analyticsService.getYoyComparison(commonParams(req));
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/underperforming-rooms */
export async function getUnderperformingRooms(req, res, next) {
  try {
    const threshold = Number(req.query.threshold ?? 50);
    const data = await analyticsService.getUnderperformingRooms({
      ...commonParams(req),
      ...paginationParams(req),
      threshold: Number.isFinite(threshold) ? threshold : 50,
    });
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/outstanding-bills */
export async function getOutstandingBills(req, res, next) {
  try {
    const { location } = req.query;
    const data = await analyticsService.getOutstandingBills({ location: location || undefined });
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/category-summary */
export async function getCategorySummary(req, res, next) {
  try {
    const { startDate, endDate, location, roomNumber } = req.query;
    const data = await analyticsService.getCategorySummary({
      startDate:  startDate  || undefined,
      endDate:    endDate    || undefined,
      location:   location   || undefined,
      roomNumber: roomNumber || undefined,
    });
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/occupancy-by-location */
export async function getOccupancyByLocation(req, res, next) {
  try {
    const data = await analyticsService.getOccupancyByLocation(commonParams(req));
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/profit-per-location */
export async function getProfitPerLocation(req, res, next) {
  try {
    const data = await analyticsService.getProfitPerLocation(commonParams(req));
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /api/analytics/expense-breakdown */
export async function getExpenseBreakdown(req, res, next) {
  try {
    const data = await analyticsService.getExpenseBreakdown(commonParams(req));
    res.json({ data });
  } catch (err) { next(err); }
}
