/**
 * @file client.js
 * @description Base REST API client with automatic token attachment and refresh.
 * All API modules import from this file.
 */

import { unwrapEnvelope } from '../lib/unwrapEnvelope.js';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// ── Token storage ────────────────────────────────────────────────────────────

const TOKEN_KEY = 'kr_access_token';
const REFRESH_TOKEN_KEY = 'kr_refresh_token';

export const tokenStorage = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (t) => localStorage.setItem(TOKEN_KEY, t),
  getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  setRefreshToken: (t) => localStorage.setItem(REFRESH_TOKEN_KEY, t),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

// ── Refresh lock (prevent concurrent refreshes) ──────────────────────────────

let _refreshPromise = null;

async function refreshAccessToken() {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const refreshToken = tokenStorage.getRefreshToken();
    if (!refreshToken) throw new Error('No refresh token available');

    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      throw new Error('Token refresh failed');
    }

    const { accessToken } = await res.json();
    tokenStorage.setToken(accessToken);
    return accessToken;
  })();

  try {
    return await _refreshPromise;
  } finally {
    _refreshPromise = null;
  }
}

// ── Response parsing ─────────────────────────────────────────────────────────

/**
 * Parse JSON body, unwrapping a `{ data }` envelope only when `data` is the
 * sole key. Preserves paginated shapes like `{ data, total, page, limit }`.
 * @param {Response} res
 * @returns {Promise<any>}
 */
export async function parseJsonBody(res) {
  return unwrapEnvelope(await res.json());
}

// ── Core fetch wrapper ───────────────────────────────────────────────────────

/**
 * Fetch wrapper that:
 * - Attaches Authorization header from localStorage
 * - Auto-refreshes token on 401 and retries once
 * - Dispatches 'auth:logout' event if refresh fails
 *
 * @param {string} path - API path (e.g. '/api/transactions')
 * @param {RequestInit} options - fetch options
 * @returns {Promise<any>} parsed JSON response
 */
export async function apiFetch(path, options = {}) {
  const token = tokenStorage.getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  // Token expired — attempt refresh once
  if (res.status === 401) {
    try {
      const newToken = await refreshAccessToken();

      const retryRes = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
          ...headers,
          Authorization: `Bearer ${newToken}`,
        },
      });

      if (!retryRes.ok) {
        const errBody = await retryRes.json().catch(() => ({}));
        throw new Error(errBody.message || `HTTP ${retryRes.status}`);
      }

      return parseJsonBody(retryRes);
    } catch {
      // Refresh failed — force logout
      tokenStorage.clear();
      window.dispatchEvent(new Event('auth:logout'));
      throw new Error('Session expired. Please sign in again.');
    }
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.message || `HTTP ${res.status}`);
  }

  // 204 No Content
  if (res.status === 204) return null;

  return parseJsonBody(res);
}

// ── Typed helpers ────────────────────────────────────────────────────────────

/**
 * Serialize an object into a URL query string (skips null/undefined values).
 * @param {Record<string, any>} params
 * @returns {string} e.g. "?page=1&limit=10"
 */
function toQueryString(params) {
  if (!params || typeof params !== 'object') return '';
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return qs ? `?${qs}` : '';
}

export const api = {
  /** GET with optional query params */
  get: (path, params) => apiFetch(`${path}${toQueryString(params)}`),

  /** POST with JSON body */
  post: (path, body) =>
    apiFetch(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  /** PUT with JSON body */
  put: (path, body) =>
    apiFetch(path, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  /** PATCH with JSON body */
  patch: (path, body) =>
    apiFetch(path, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  /** DELETE — params become query string */
  del: (path, params) =>
    apiFetch(`${path}${toQueryString(params)}`, { method: 'DELETE' }),
};

export { BASE_URL };
