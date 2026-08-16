/**
 * @file analytics.api.js
 * @description Analytics REST API module.
 * All endpoints require admin or super_admin role.
 */

import { api } from './client.js';

export const analyticsApi = {
  /** GET /api/analytics/kpis */
  getKpis: (params) => api.get('/api/analytics/kpis', params),

  /** GET /api/analytics/occupancy */
  getOccupancy: (params) => api.get('/api/analytics/occupancy', params),

  /** GET /api/analytics/location-fullness */
  getLocationFullness: (params) => api.get('/api/analytics/location-fullness', params),

  /** GET /api/analytics/stay-duration */
  getStayDuration: (params) => api.get('/api/analytics/stay-duration', params),

  /** GET /api/analytics/marketing */
  getMarketing: (params) => api.get('/api/analytics/marketing', params),

  /** GET /api/analytics/payment-methods */
  getPaymentMethods: (params) => api.get('/api/analytics/payment-methods', params),

  /** GET /api/analytics/guest-sources */
  getGuestSources: (params) => api.get('/api/analytics/guest-sources', params),

  /** GET /api/analytics/repeat-guests */
  getRepeatGuests: (params) => api.get('/api/analytics/repeat-guests', params),

  /** GET /api/analytics/employee-performance */
  getEmployeePerformance: (params) => api.get('/api/analytics/employee-performance', params),

  /** GET /api/analytics/shift-performance */
  getShiftPerformance: (params) => api.get('/api/analytics/shift-performance', params),

  /** GET /api/analytics/checkin-heatmap */
  getCheckinHeatmap: (params) => api.get('/api/analytics/checkin-heatmap', params),

  /** GET /api/analytics/daily-revenue */
  getDailyRevenue: (params) => api.get('/api/analytics/daily-revenue', params),

  /** GET /api/analytics/monthly-revenue */
  getMonthlyRevenue: (params) => api.get('/api/analytics/monthly-revenue', params),

  /** GET /api/analytics/net-profit */
  getNetProfit: (params) => api.get('/api/analytics/net-profit', params),

  /** GET /api/analytics/yoy-comparison */
  getYoyComparison: (params) => api.get('/api/analytics/yoy-comparison', params),

  /** GET /api/analytics/underperforming-rooms */
  getUnderperformingRooms: (params) => api.get('/api/analytics/underperforming-rooms', params),

  /** GET /api/analytics/outstanding-bills */
  getOutstandingBills: (params) => api.get('/api/analytics/outstanding-bills', params),

  /** GET /api/analytics/category-summary */
  getCategorySummary: (params) => api.get('/api/analytics/category-summary', params),

  /** GET /api/analytics/occupancy-by-location */
  getOccupancyByLocation: (params) => api.get('/api/analytics/occupancy-by-location', params),

  /** GET /api/analytics/profit-per-location */
  getProfitPerLocation: (params) => api.get('/api/analytics/profit-per-location', params),

  /** GET /api/analytics/expense-breakdown */
  getExpenseBreakdown: (params) => api.get('/api/analytics/expense-breakdown', params),
};
