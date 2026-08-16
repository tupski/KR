/**
 * @file settings.api.js
 * @description System settings and announcements REST API module.
 */

import { api } from './client.js';

export const settingsApi = {
  /** GET /api/settings — all settings as key-value map */
  getAll: () => api.get('/api/settings'),

  /** GET /api/settings/:key */
  get: (key) => api.get(`/api/settings/${key}`),

  /** PUT /api/settings/:key */
  update: (key, data) => api.put(`/api/settings/${key}`, data),

  /** GET /api/settings/announcements */
  listAnnouncements: () => api.get('/api/settings/announcements'),

  /** POST /api/settings/announcements */
  createAnnouncement: (data) => api.post('/api/settings/announcements', data),

  /** PUT /api/settings/announcements/:id */
  updateAnnouncement: (id, data) => api.put(`/api/settings/announcements/${id}`, data),

  /** DELETE /api/settings/announcements/:id */
  deleteAnnouncement: (id) => api.del(`/api/settings/announcements/${id}`),
};
