/**
 * @file analytics.routes.js
 * @description Express router for analytics endpoints.
 * Mounted at /api/analytics in app.js.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.middleware.js';
import * as ctrl from './analytics.controller.js';

const router = Router();

// All analytics routes require authentication
router.use(requireAuth);

// ── Admin-only summary endpoints ──────────────────────────────────────────────
const adminOnly = requireRole('admin', 'super_admin');

router.get('/kpis',                  adminOnly, ctrl.getKpis);
router.get('/occupancy',             adminOnly, ctrl.getOccupancy);
router.get('/location-fullness',     adminOnly, ctrl.getLocationFullness);
router.get('/stay-duration',         adminOnly, ctrl.getStayDuration);
router.get('/marketing',             adminOnly, ctrl.getMarketing);
router.get('/payment-methods',       adminOnly, ctrl.getPaymentMethods);
router.get('/guest-sources',         adminOnly, ctrl.getGuestSources);
router.get('/repeat-guests',         adminOnly, ctrl.getRepeatGuests);
router.get('/employee-performance',  adminOnly, ctrl.getEmployeePerformance);
router.get('/shift-performance',     adminOnly, ctrl.getShiftPerformance);
router.get('/checkin-heatmap',       adminOnly, ctrl.getCheckinHeatmap);
router.get('/daily-revenue',         adminOnly, ctrl.getDailyRevenue);
router.get('/monthly-revenue',       adminOnly, ctrl.getMonthlyRevenue);
router.get('/net-profit',            adminOnly, ctrl.getNetProfit);
router.get('/yoy-comparison',        adminOnly, ctrl.getYoyComparison);
router.get('/underperforming-rooms', adminOnly, ctrl.getUnderperformingRooms);
router.get('/outstanding-bills',     adminOnly, ctrl.getOutstandingBills);
router.get('/category-summary',      adminOnly, ctrl.getCategorySummary);
router.get('/occupancy-by-location', adminOnly, ctrl.getOccupancyByLocation);
router.get('/profit-per-location',   adminOnly, ctrl.getProfitPerLocation);
router.get('/expense-breakdown',     adminOnly, ctrl.getExpenseBreakdown);

export default router;
