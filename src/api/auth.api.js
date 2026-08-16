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
};
