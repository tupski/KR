/**
 * @file locations.api.js
 * @description Locations REST API module.
 */

import { api } from './client.js';

export const locationsApi = {
  /** GET /api/locations */
  list: () => api.get('/api/locations'),

  /** POST /api/locations */
  create: (name) => api.post('/api/locations', { name }),

  /** DELETE /api/locations/:name */
  delete: (name) => api.del(`/api/locations/${encodeURIComponent(name)}`),

  /**
   * GET /api/locations/rooms - List rooms with occupancy status
   * @param {{ location?: string }} params
   */
  listRoomsWithOccupancy: (params) => api.get('/api/locations/rooms', params),

  /**
   * GET /api/locations/rooms/report - List rooms for reports
   * @param {{ startDate: string, endDate: string, location?: string }} params
   */
  listRoomsForReport: (params) => api.get('/api/locations/rooms/report', params),

  /** POST /api/locations/rooms - Create a new room */
  createRoom: (data) => api.post('/api/locations/rooms', data),

  /** DELETE /api/locations/rooms/:id - Delete a room */
  deleteRoom: (id) => api.del(`/api/locations/rooms/${id}`),

  /** GET /api/locations/stats - Get stats for dashboard */
  getStats: () => api.get('/api/locations/stats'),
};
