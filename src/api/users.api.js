/**
 * @file users.api.js
 * @description Users REST API module.
 */

import { api } from './client.js';

export const usersApi = {
  /** GET /api/users/me — current user profile */
  getMe: () => api.get('/api/users/me'),

  /** GET /api/users/me/role */
  getMyRole: () => api.get('/api/users/me/role'),

  /** PUT /api/users/me/profile */
  updateMyProfile: (data) => api.put('/api/users/me/profile', data),

  /** GET /api/users — list all users (admin) */
  list: (params) => api.get('/api/users', params),

  /** GET /api/users/:id */
  getById: (id) => api.get(`/api/users/${id}`),

  /** POST /api/users */
  create: (data) => api.post('/api/users', data),

  /** PUT /api/users/:id — update user (admin) */
  update: (id, data) => api.put(`/api/users/${id}`, data),

  /** DELETE /api/users/:id */
  delete: (id) => api.del(`/api/users/${id}`),

  /** POST /api/users/:id/reset-password */
  resetPassword: (id, data) => api.post(`/api/users/${id}/reset-password`, data),

  /** POST /api/users/:id/signout-all — sign out all devices */
  signOutAll: (id) => api.post(`/api/users/${id}/signout-all`),

  /** GET /api/users/:id/locations */
  getLocations: (id) => api.get(`/api/users/${id}/locations`),

  /** PUT /api/users/:id/locations */
  setLocations: (id, data) => api.put(`/api/users/${id}/locations`, data),

  /** POST /api/users/:id/locations/toggle — toggle a location assignment */
  toggleLocation: (id, data) => api.post(`/api/users/${id}/locations/toggle`, data),
};
