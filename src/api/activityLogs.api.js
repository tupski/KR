/**
 * @file activityLogs.api.js
 * @description Activity logs REST API module.
 */

import { api } from './client.js';

export const activityLogsApi = {
  /** GET /api/activity-logs — list activity logs with pagination */
  list: (params) => api.get('/api/activity-logs', params),

  /** POST /api/activity-logs — create activity log entry */
  create: (data) => api.post('/api/activity-logs', data),

  /** GET /api/activity-logs/stats — get stats for dashboard */
  getStats: (params) => api.get('/api/activity-logs/stats', params),
};
