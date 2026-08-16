/**
 * @file auth.service.js
 * @description Authentication service layer.
 * All database operations go through the pg pool; no HTTP concerns here.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../../config/database.js';
import { env } from '../../config/env.js';

// ── User queries ─────────────────────────────────────────────────────────────

/**
 * Find a user record by email address.
 *
 * @param {string} email
 * @returns {Promise<object|null>} User row or null
 */
async function findUserByEmail(email) {
  const result = await query(
    'SELECT id, email, role, password_hash FROM users WHERE email = $1 LIMIT 1',
    [email],
  );
  return result.rows[0] ?? null;
}

/**
 * Find a user record by primary key.
 *
 * @param {string} id - UUID
 * @returns {Promise<object|null>} User row or null
 */
async function findUserById(id) {
  const result = await query(
    'SELECT id, email, role FROM users WHERE id = $1 LIMIT 1',
    [id],
  );
  return result.rows[0] ?? null;
}

// ── Session queries ───────────────────────────────────────────────────────────

/**
 * Persist a new refresh-token session.
 *
 * @param {{ userId: string, refreshToken: string, deviceInfo?: string, expiresAt: Date }} params
 * @returns {Promise<object>} Created session row
 */
async function createSession({ userId, refreshToken, deviceInfo = null, expiresAt }) {
  const result = await query(
    `INSERT INTO sessions (user_id, refresh_token, device_info, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, refreshToken, deviceInfo, expiresAt],
  );
  return result.rows[0];
}

/**
 * Look up a session by its refresh token, joining the associated user.
 *
 * @param {string} refreshToken
 * @returns {Promise<object|null>} Combined session + user data or null
 */
async function findSessionByRefreshToken(refreshToken) {
  const result = await query(
    `SELECT
       s.id          AS session_id,
       s.refresh_token,
       s.expires_at,
       s.device_info,
       u.id          AS user_id,
       u.email,
       u.role
     FROM sessions s
     JOIN users    u ON u.id = s.user_id
     WHERE s.refresh_token = $1
     LIMIT 1`,
    [refreshToken],
  );
  return result.rows[0] ?? null;
}

/**
 * Update the refresh token on an existing session (token rotation).
 *
 * @param {string} oldRefreshToken - Token to identify the session
 * @param {string} newRefreshToken - Replacement token
 * @param {Date}   newExpiresAt    - Updated expiry timestamp
 * @returns {Promise<void>}
 */
async function rotateSessionToken(oldRefreshToken, newRefreshToken, newExpiresAt) {
  await query(
    `UPDATE sessions
     SET refresh_token = $1, expires_at = $2
     WHERE refresh_token = $3`,
    [newRefreshToken, newExpiresAt, oldRefreshToken],
  );
}

/**
 * Delete a single session by refresh token (logout).
 *
 * @param {string} refreshToken
 * @returns {Promise<void>}
 */
async function deleteSession(refreshToken) {
  await query('DELETE FROM sessions WHERE refresh_token = $1', [refreshToken]);
}

/**
 * Delete all sessions belonging to a user (logout everywhere).
 *
 * @param {string} userId - UUID
 * @returns {Promise<void>}
 */
async function deleteAllUserSessions(userId) {
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

// ── Password helpers ──────────────────────────────────────────────────────────

/**
 * Compare a plaintext password against a stored bcrypt hash.
 *
 * @param {string} plain  - Raw password from the client
 * @param {string} hashed - Stored bcrypt hash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(plain, hashed) {
  return bcrypt.compare(plain, hashed);
}

/**
 * Hash a plaintext password using bcrypt (12 rounds).
 *
 * @param {string} plain
 * @returns {Promise<string>} bcrypt hash
 */
async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

// ── Token generation ──────────────────────────────────────────────────────────

/**
 * Calculate a future Date by parsing a duration string like "30d", "15m", "7d".
 *
 * @param {string} duration - e.g. "15m", "7d", "24h"
 * @returns {Date}
 */
function parseDurationToDate(duration) {
  const units = { s: 1, m: 60, h: 3600, d: 86400 };
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration format: ${duration}`);
  const seconds = parseInt(match[1], 10) * (units[match[2]] ?? 1);
  return new Date(Date.now() + seconds * 1000);
}

/**
 * Generate a JWT access token and an opaque refresh token for a user.
 *
 * @param {{ id: string, email: string, role: string }} user
 * @returns {{ accessToken: string, refreshToken: string, expiresIn: string, refreshExpiresAt: Date }}
 */
function generateTokens(user) {
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN },
  );

  const refreshToken = crypto.randomBytes(64).toString('hex');
  const refreshExpiresAt = parseDurationToDate(env.JWT_REFRESH_EXPIRES_IN);

  return {
    accessToken,
    refreshToken,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshExpiresAt,
  };
}

export {
  findUserByEmail,
  findUserById,
  createSession,
  findSessionByRefreshToken,
  rotateSessionToken,
  deleteSession,
  deleteAllUserSessions,
  verifyPassword,
  hashPassword,
  generateTokens,
};
