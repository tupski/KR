/**
 * @file auth.api.js
 * @description Authentication API — login, logout, refresh, session, role.
 */

import { api, tokenStorage } from './client.js';

export const authApi = {
  /**
   * POST /api/auth/login
   * Saves access + refresh tokens to storage.
   * @returns {{ user, accessToken, refreshToken }}
   */
  login: async (email, password) => {
    const data = await api.post('/api/auth/login', { email, password });
    tokenStorage.setToken(data.accessToken);
    tokenStorage.setRefreshToken(data.refreshToken);
    return data;
  },

  /**
   * POST /api/auth/logout
   * Sends refresh token in body, then clears local storage.
   */
  logout: async () => {
    const refreshToken = tokenStorage.getRefreshToken();
    try {
      await api.post('/api/auth/logout', { refreshToken });
    } finally {
      tokenStorage.clear();
    }
  },

  /**
   * POST /api/auth/refresh
   * Uses the stored refresh token to obtain a new access token.
   * @returns {{ accessToken }}
   */
  refresh: async () => {
    const refreshToken = tokenStorage.getRefreshToken();
    const data = await api.post('/api/auth/refresh', { refreshToken });
    tokenStorage.setToken(data.accessToken);
    return data;
  },

  /**
   * GET /api/auth/session
   * Returns the current user from server-side session validation.
   * @returns {{ user: { id, email, role } }}
   */
  getSession: () => api.get('/api/auth/session'),

  /**
   * GET /api/users/me/role
   * Returns the current user's role.
   * @returns {{ role }}
   */
  getMyRole: () => api.get('/api/users/me/role'),

  /**
   * POST /api/auth/sign-out-all-devices
   * Revoke all refresh tokens for current user (sign out from all devices).
   * @returns {{ success: boolean }}
   */
  signOutAllDevices: () => api.post('/api/auth/sign-out-all-devices'),

  /**
   * PUT /api/auth/password
   * Change password (requires re-authentication with old password).
   * @param {string} oldPassword - Current password for verification
   * @param {string} newPassword - New password to set
   * @returns {{ success: boolean }}
   */
  changePassword: (oldPassword, newPassword) => api.put('/api/auth/password', { oldPassword, newPassword }),

  /**
   * PUT /api/auth/metadata
   * Update user metadata (e.g., full_name, avatar_url).
   * @param {object} metadata - Metadata fields to update
   * @returns {{ user: object }}
   */
  updateMetadata: (metadata) => api.put('/api/auth/metadata', metadata),
};
