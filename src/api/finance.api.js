/**
 * @file finance.api.js
 * @description Finance REST API module - tagihan bulanan, fee marketing, deposits.
 */

import { api } from './client.js';

export const financeApi = {
  // ── Tagihan Bulanan ───────────────────────────────────────────────────────────

  /**
   * GET /api/finance/tagihan-bulanan
   * @param {{ page?, limit?, status?, location?, roomNumber? }} params
   */
  listTagihanBulanan: (params) => api.get('/api/finance/tagihan-bulanan', params),

  /** POST /api/finance/tagihan-bulanan */
  createTagihanBulanan: (data) => api.post('/api/finance/tagihan-bulanan', data),

  /** GET /api/finance/tagihan-bulanan/:id */
  getTagihanBulananById: (id) => api.get(`/api/finance/tagihan-bulanan/${id}`),

  /** PUT /api/finance/tagihan-bulanan/:id */
  updateTagihanBulanan: (id, data) => api.put(`/api/finance/tagihan-bulanan/${id}`, data),

  /** PUT /api/finance/tagihan-bulanan/:id/pay */
  payTagihanBulanan: (id, data) => api.put(`/api/finance/tagihan-bulanan/${id}/pay`, data),

  /** DELETE /api/finance/tagihan-bulanan/:id */
  deleteTagihanBulanan: (id) => api.del(`/api/finance/tagihan-bulanan/${id}`),

  // ── Fee Marketing ─────────────────────────────────────────────────────────────

  /**
   * GET /api/finance/fee-lunas
   * @param {{ page?, limit?, marketingName?, startDate?, endDate? }} params
   */
  listFeeLunas: (params) => api.get('/api/finance/fee-lunas', params),

  /**
   * GET /api/finance/fee-unpaid
   * @param {{ marketingName?, startDate?, endDate? }} params
   */
  listFeeUnpaid: (params) => api.get('/api/finance/fee-unpaid', params),

  /** POST /api/finance/fee-pay */
  payFeeItems: (data) => api.post('/api/finance/fee-pay', data),

  /** DELETE /api/finance/fee-lunas/:id */
  deleteFeeLunas: (id) => api.del(`/api/finance/fee-lunas/${id}`),

  // ── Deposits ──────────────────────────────────────────────────────────────────

  /** GET /api/finance/deposits */
  listDeposits: (params) => api.get('/api/finance/deposits', params),
};
