/**
 * @file requests.api.js
 * @description Requests REST API module for employee requests (leave, kasbon, etc.).
 */

import { api } from './client.js';

export const requestsApi = {
  /**
   * GET /api/requests - List requests with optional filters
   * @param {{ page?: number, limit?: number, status?: string, userId?: string, location?: string }} params
   */
  list: (params) => api.get('/api/requests', params),

  /**
   * POST /api/requests - Create a new request
   * @param {{ request_type: string, apartment_location?: string, desired_date?: string, notes?: string, employee_name?: string, amount?: number }} data
   */
  create: (data) => api.post('/api/requests', data),

  /**
   * GET /api/requests/:id - Get a single request
   * @param {string} id
   */
  getById: (id) => api.get(`/api/requests/${id}`),

  /**
   * PUT /api/requests/:id/status - Update request status (admin only)
   * @param {string} id
   * @param {{ status: string, response_notes?: string }} data
   */
  updateStatus: (id, data) => api.put(`/api/requests/${id}/status`, data),

  /**
   * DELETE /api/requests/:id - Delete a request (admin only)
   * @param {string} id
   */
  delete: (id) => api.del(`/api/requests/${id}`),
};
