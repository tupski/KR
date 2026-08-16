/**
 * @file menu.api.js
 * @description Menu visibility REST API module.
 * Manages role-based menu visibility settings.
 */

import { api } from './client.js';

export const menuApi = {
  /**
   * GET /api/menu/visibility — list all menu visibility settings
   * Returns array of { role, menu_item_id, is_visible }
   */
  getVisibility: () => api.get('/api/menu/visibility'),

  /**
   * PUT /api/menu/visibility — upsert a single menu visibility setting
   * @param {{ role: string, menu_item_id: string, is_visible: boolean }} data
   */
  setVisibility: (data) => api.put('/api/menu/visibility', data),

  /**
   * POST /api/menu/visibility/bulk — bulk upsert menu visibility settings
   * @param {Array<{ role: string, menu_item_id: string, is_visible: boolean }>} items
   */
  setVisibilityBulk: (items) => api.post('/api/menu/visibility/bulk', items),

  /**
   * POST /api/menu/visibility/reset — reset visibility to defaults
   */
  resetVisibility: () => api.post('/api/menu/visibility/reset'),
};
