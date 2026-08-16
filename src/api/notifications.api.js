/**
 * @file notifications.api.js
 * @description Notifications REST API module.
 */

import { api } from './client.js';

export const notificationsApi = {
  /** GET /api/notifications */
  list: (params) => api.get('/api/notifications', params),

  /** GET /api/notifications/unread-count */
  getUnreadCount: () => api.get('/api/notifications/unread-count'),

  /** POST /api/notifications/:id/hide - hide single notification */
  hide: (id) => api.post(`/api/notifications/${id}/hide`),

  /** POST /api/notifications/hide - bulk hide notifications */
  hideMany: (notificationIds) => api.post('/api/notifications/hide', { notification_ids: notificationIds }),

  /** POST /api/notifications/mark-read - mark notifications as read */
  markRead: (notificationIds) => api.post('/api/notifications/mark-read', { notification_ids: notificationIds }),

  /** POST /api/notifications/read-status - get read status for notifications */
  getReadStatus: (notificationIds) => api.post('/api/notifications/read-status', { notification_ids: notificationIds }),

  /** POST /api/notifications/hidden-status - get hidden status for notifications */
  getHiddenStatus: (notificationIds) => api.post('/api/notifications/hidden-status', { notification_ids: notificationIds }),

  /** GET /api/notifications/preferences */
  getPreferences: () => api.get('/api/notifications/preferences'),

  /** PUT /api/notifications/preferences */
  updatePreferences: (data) => api.put('/api/notifications/preferences', data),

  /** POST /api/notifications/subscribe — Web Push subscription */
  subscribe: (subscription) => api.post('/api/notifications/subscribe', subscription),

  /** DELETE /api/notifications/subscribe — unsubscribe by endpoint */
  unsubscribe: (endpoint) => api.del('/api/notifications/subscribe', { endpoint }),
};
