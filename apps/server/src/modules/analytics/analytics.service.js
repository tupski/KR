/**
 * @file analytics.service.js
 * @description Analytics service — calls PostgreSQL RPC functions from 007_analytics_rpcs.sql.
 * All functions delegate to callRpc(); no direct SQL aggregation here.
 */

import { query } from '../../config/database.js';

// ── RPC helper ────────────────────────────────────────────────────────────────

/**
 * Call a PostgreSQL RPC function and return the raw result rows.
 * RPC functions that return a single JSON object use `SELECT fn() as result`.
 * RPC functions that return a TABLE are called with `SELECT * FROM fn(...)`.
 *
 * @param {string} fnName  - PostgreSQL function name (no schema prefix)
 * @param {any[]}  params  - Ordered positional parameters ($1, $2, ...)
 * @param {'scalar'|'table'} mode - 'scalar' wraps result in AS result; 'table' selects *
 * @returns {Promise<any>} scalar: the result value; table: array of rows
 */
async function callRpc(fnName, params = [], mode = 'table') {
  const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
  const sql =
    mode === 'scalar'
      ? `SELECT ${fnName}(${placeholders}) AS result`
      : `SELECT * FROM ${fnName}(${placeholders})`;

  const result = await query(sql, params);

  if (mode === 'scalar') {
    return result.rows[0]?.result ?? null;
  }
  return result.rows;
}

// ── Dashboard KPIs ────────────────────────────────────────────────────────────

/**
 * @param {{ startDate?: string, endDate?: string, location?: string }} opts
 * get_dashboard_kpis(p_start_date, p_end_date, p_location)
 */
export async function getDashboardKpis({ startDate, endDate, location } = {}) {
  return callRpc('get_dashboard_kpis', [startDate ?? null, endDate ?? null, location ?? null]);
}

// ── Occupancy ─────────────────────────────────────────────────────────────────

/**
 * get_occupancy_per_unit(p_start_date, p_end_date, p_location, p_limit, p_offset)
 * @param {{ startDate?: string, endDate?: string, location?: string, limit?: number, offset?: number }} opts
 */
export async function getOccupancyPerUnit({ startDate, endDate, location, limit = 10, offset = 0 } = {}) {
  return callRpc('get_occupancy_per_unit', [
    startDate ?? null,
    endDate ?? null,
    location ?? null,
    limit,
    offset,
  ]);
}

/**
 * get_occupancy_per_location(p_start_date, p_end_date, p_location)
 * @param {{ startDate?: string, endDate?: string, location?: string }} opts
 */
export async function getOccupancyByLocation({ startDate, endDate, location } = {}) {
  return callRpc('get_occupancy_per_location', [startDate ?? null, endDate ?? null, location ?? null]);
}

// ── Location fullness ─────────────────────────────────────────────────────────

/**
 * get_location_fullness(p_start_date, p_end_date, p_location)
 * @param {{ startDate?: string, endDate?: string, location?: string }} opts
 */
export async function getLocationFullness({ startDate, endDate, location } = {}) {
  return callRpc('get_location_fullness', [startDate ?? null, endDate ?? null, location ?? null]);
}

// ── Stay duration ─────────────────────────────────────────────────────────────

/**
 * get_stay_duration_summary(p_start_date, p_end_date, p_location)
 * @param {{ startDate?: string, endDate?: string, location?: string }} opts
 */
export async function getStayDurationSummary({ startDate, endDate, location } = {}) {
  return callRpc('get_stay_duration_summary', [startDate ?? null, endDate ?? null, location ?? null]);
}

// ── Marketing ─────────────────────────────────────────────────────────────────

/**
 * get_marketing_performance(p_start_date, p_end_date, p_location, p_limit, p_offset)
 * @param {{ startDate?: string, endDate?: string, location?: string, limit?: number, offset?: number }} opts
 */
export async function getMarketingPerformance({ startDate, endDate, location, limit = 10, offset = 0 } = {}) {
  return callRpc('get_marketing_performance', [
    startDate ?? null,
    endDate ?? null,
    location ?? null,
    limit,
    offset,
  ]);
}

// ── Payment methods ───────────────────────────────────────────────────────────

/**
 * get_payment_method_summary(p_start_date, p_end_date, p_location)
 * @param {{ startDate?: string, endDate?: string, location?: string }} opts
 */
export async function getPaymentMethodSummary({ startDate, endDate, location } = {}) {
  return callRpc('get_payment_method_summary', [startDate ?? null, endDate ?? null, location ?? null]);
}

// ── Guest sources ─────────────────────────────────────────────────────────────

/**
 * get_guest_source_summary(p_start_date, p_end_date, p_location, p_limit, p_offset)
 * @param {{ startDate?: string, endDate?: string, location?: string, limit?: number, offset?: number }} opts
 */
export async function getGuestSourceSummary({ startDate, endDate, location, limit = 10, offset = 0 } = {}) {
  return callRpc('get_guest_source_summary', [
    startDate ?? null,
    endDate ?? null,
    location ?? null,
    limit,
    offset,
  ]);
}

// ── Repeat guests ─────────────────────────────────────────────────────────────

/**
 * get_repeat_guests(p_start_date, p_end_date, p_location, p_limit, p_offset)
 * @param {{ startDate?: string, endDate?: string, location?: string, limit?: number, offset?: number }} opts
 */
export async function getRepeatGuestSummary({ startDate, endDate, location, limit = 10, offset = 0 } = {}) {
  return callRpc('get_repeat_guests', [
    startDate ?? null,
    endDate ?? null,
    location ?? null,
    limit,
    offset,
  ]);
}

// ── Employee & shift performance ──────────────────────────────────────────────

/**
 * get_performance_by_employee(p_start_date, p_end_date, p_location, p_limit, p_offset)
 * @param {{ startDate?: string, endDate?: string, location?: string, limit?: number, offset?: number }} opts
 */
export async function getEmployeePerformance({ startDate, endDate, location, limit = 10, offset = 0 } = {}) {
  return callRpc('get_performance_by_employee', [
    startDate ?? null,
    endDate ?? null,
    location ?? null,
    limit,
    offset,
  ]);
}

/**
 * get_performance_by_shift(p_start_date, p_end_date, p_location)
 * @param {{ startDate?: string, endDate?: string, location?: string }} opts
 */
export async function getShiftPerformance({ startDate, endDate, location } = {}) {
  return callRpc('get_performance_by_shift', [startDate ?? null, endDate ?? null, location ?? null]);
}

// ── Check-in heatmap ──────────────────────────────────────────────────────────

/**
 * get_checkin_heatmap(p_start_date, p_end_date, p_location)
 * @param {{ startDate?: string, endDate?: string, location?: string }} opts
 */
export async function getCheckinHeatmap({ startDate, endDate, location } = {}) {
  return callRpc('get_checkin_heatmap', [startDate ?? null, endDate ?? null, location ?? null]);
}

// ── Revenue trends ────────────────────────────────────────────────────────────

/**
 * get_daily_revenue_trend(p_start_date, p_end_date, p_location, p_limit, p_offset)
 * @param {{ startDate?: string, endDate?: string, location?: string, limit?: number, offset?: number }} opts
 */
export async function getDailyRevenueTrend({ startDate, endDate, location, limit = 31, offset = 0 } = {}) {
  return callRpc('get_daily_revenue_trend', [
    startDate ?? null,
    endDate ?? null,
    location ?? null,
    limit,
    offset,
  ]);
}

/**
 * get_monthly_revenue_trend(p_start_date, p_end_date, p_location)
 * @param {{ startDate?: string, endDate?: string, location?: string }} opts
 */
export async function getMonthlyRevenueTrend({ startDate, endDate, location } = {}) {
  return callRpc('get_monthly_revenue_trend', [startDate ?? null, endDate ?? null, location ?? null]);
}

// ── Profit & YoY ─────────────────────────────────────────────────────────────

/**
 * get_net_profit_per_location(p_start_date, p_end_date, p_location)
 * @param {{ startDate?: string, endDate?: string, location?: string }} opts
 */
export async function getNetProfitSummary({ startDate, endDate, location } = {}) {
  return callRpc('get_net_profit_per_location', [startDate ?? null, endDate ?? null, location ?? null]);
}

/**
 * get_revenue_yoy_comparison(p_start_date, p_end_date, p_location)
 * @param {{ startDate?: string, endDate?: string, location?: string }} opts
 */
export async function getYoyComparison({ startDate, endDate, location } = {}) {
  return callRpc('get_revenue_yoy_comparison', [startDate ?? null, endDate ?? null, location ?? null]);
}

// ── Underperforming rooms ─────────────────────────────────────────────────────

/**
 * get_underperforming_rooms(p_start_date, p_end_date, p_location, p_threshold_pct, p_limit, p_offset)
 * @param {{ startDate?: string, endDate?: string, location?: string, threshold?: number, limit?: number, offset?: number }} opts
 */
export async function getUnderperformingRooms({
  startDate,
  endDate,
  location,
  threshold = 50,
  limit = 10,
  offset = 0,
} = {}) {
  return callRpc('get_underperforming_rooms', [
    startDate ?? null,
    endDate ?? null,
    location ?? null,
    threshold,
    limit,
    offset,
  ]);
}

// ── Outstanding bills ─────────────────────────────────────────────────────────

/**
 * get_outstanding_bills_summary(p_location)
 * @param {{ location?: string }} opts
 */
export async function getOutstandingBills({ location } = {}) {
  return callRpc('get_outstanding_bills_summary', [location ?? null]);
}

// ── Category & expense summaries ──────────────────────────────────────────────

/**
 * get_category_summary(p_lokasi, p_kamar, p_start_date, p_end_date)
 * Note: uses p_lokasi / p_kamar (not p_location) — matches the actual function signature.
 * @param {{ startDate?: string, endDate?: string, location?: string, roomNumber?: string }} opts
 */
export async function getCategorySummary({ startDate, endDate, location, roomNumber } = {}) {
  return callRpc('get_category_summary', [
    location ?? null,
    roomNumber ?? null,
    startDate ?? null,
    endDate ?? null,
  ]);
}

/**
 * get_profit_per_location(p_start_date, p_end_date, p_location)
 * @param {{ startDate?: string, endDate?: string, location?: string }} opts
 */
export async function getProfitPerLocation({ startDate, endDate, location } = {}) {
  return callRpc('get_profit_per_location', [startDate ?? null, endDate ?? null, location ?? null]);
}

/**
 * get_expense_breakdown_summary(p_start_date, p_end_date, p_location)
 * @param {{ startDate?: string, endDate?: string, location?: string }} opts
 */
export async function getExpenseBreakdown({ startDate, endDate, location } = {}) {
  return callRpc('get_expense_breakdown_summary', [startDate ?? null, endDate ?? null, location ?? null]);
}
