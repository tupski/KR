/**
 * @file transactions.api.js
 * @description Transactions REST API module.
 */

import { api } from './client.js';

export const transactionsApi = {
  /**
   * GET /api/transactions
   * @param {{ page?, limit?, startDate?, endDate?, location?, search? }} params
   */
  list: (params) => api.get('/api/transactions', params),

  /** GET /api/transactions/:id */
  getById: (id) => api.get(`/api/transactions/${id}`),

  /** POST /api/transactions */
  create: (data) => api.post('/api/transactions', data),

  /** PUT /api/transactions/:id */
  update: (id, data) => api.put(`/api/transactions/${id}`, data),

  /** DELETE /api/transactions/:id */
  delete: (id) => api.del(`/api/transactions/${id}`),

  /** POST /api/transactions/:id/return-deposit */
  returnDeposit: (id, data) => api.post(`/api/transactions/${id}/return-deposit`, data),

  /** GET /api/transactions/summary */
  getSummary: (params) => api.get('/api/transactions/summary', params),

  /** POST /api/transactions/:id/checkout - Manual checkout */
  checkout: (id) => api.post(`/api/transactions/${id}/checkout`),
};
