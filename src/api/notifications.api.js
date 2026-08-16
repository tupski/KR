/**
 * @file notifications.api.js
 * @description Notifications REST API module.
 */

import { api } from './client.js';

export const notificationsApi = {
  /** GET /api/notifications */
  list: (params) => api.get('/api/notifications', params),

  /** POST /api/notifications/:id/hide */
  hide: (id) => api.post(`/api/notifications/${id}/hide`),

  /** GET /api/notifications/preferences */
  getPreferences: () => api.get('/api/notifications/preferences'),

  /** PUT /api/notifications/preferences */
  updatePreferences: (data) => api.put('/api/notifications/preferences', data),

  /** POST /api/notifications/subscribe — Web Push subscription */
  subscribe: (subscription) => api.post('/api/notifications/subscribe', subscription),

  /** DELETE /api/notifications/subscribe — unsubscribe by endpoint */
  unsubscribe: (endpoint) => api.del('/api/notifications/subscribe', { endpoint }),
};
