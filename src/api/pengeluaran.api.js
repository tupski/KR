/**
 * @file pengeluaran.api.js
 * @description Expense (pengeluaran) REST API module.
 */

import { api } from './client.js';

export const pengeluaranApi = {
  /**
   * GET /api/pengeluaran
   * @param {{ page?, limit?, startDate?, endDate?, category? }} params
   */
  list: (params) => api.get('/api/pengeluaran', params),

  /** POST /api/pengeluaran */
  create: (data) => api.post('/api/pengeluaran', data),

  /** PUT /api/pengeluaran/:id */
  update: (id, data) => api.put(`/api/pengeluaran/${id}`, data),

  /** DELETE /api/pengeluaran/:id */
  delete: (id) => api.del(`/api/pengeluaran/${id}`),

  /** GET /api/pengeluaran/categories */
  listCategories: () => api.get('/api/pengeluaran/categories'),
};
