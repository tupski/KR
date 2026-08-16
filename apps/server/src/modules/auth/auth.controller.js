/**
 * @file auth.controller.js
 * @description HTTP request handlers for authentication endpoints.
 * Validates input with Zod, delegates business logic to auth.service.
 */

import { z } from 'zod';
import * as authService from './auth.service.js';
import { ValidationError, UnauthorizedError, NotFoundError } from '../../middleware/errorHandler.js';

// ── Input schemas ─────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validate request body against a Zod schema.
 * Throws ValidationError on failure.
 *
 * @template T
 * @param {z.ZodSchema<T>} schema
 * @param {unknown} data
 * @returns {T}
 */
function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Validation failed', result.error.flatten().fieldErrors);
  }
  return result.data;
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Authenticate a user and issue access + refresh tokens.
 *
 * @type {import('express').RequestHandler}
 */
async function login(req, res, next) {
  try {
    const { email, password } = validate(loginSchema, req.body);

    const user = await authService.findUserByEmail(email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const passwordMatch = await authService.verifyPassword(password, user.password_hash);
    if (!passwordMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const { accessToken, refreshToken, expiresIn, refreshExpiresAt } =
      authService.generateTokens(user);

    await authService.createSession({
      userId:      user.id,
      refreshToken,
      deviceInfo:  req.headers['user-agent'] ?? null,
      expiresAt:   refreshExpiresAt,
    });

    res.status(200).json({
      user: { id: user.id, email: user.email, role: user.role },
      accessToken,
      refreshToken,
      expiresIn,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * Invalidate the provided refresh token session.
 * Requires: requireAuth middleware upstream.
 *
 * @type {import('express').RequestHandler}
 */
async function logout(req, res, next) {
  try {
    const { refreshToken } = validate(logoutSchema, req.body);
    await authService.deleteSession(refreshToken);
    res.status(200).json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 * Exchange a valid refresh token for a new access token (token rotation).
 *
 * @type {import('express').RequestHandler}
 */
async function refresh(req, res, next) {
  try {
    const { refreshToken } = validate(refreshSchema, req.body);

    const session = await authService.findSessionByRefreshToken(refreshToken);
    if (!session) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    if (new Date(session.expires_at) < new Date()) {
      await authService.deleteSession(refreshToken);
      throw new UnauthorizedError('Refresh token expired');
    }

    const user = { id: session.user_id, email: session.email, role: session.role };
    const {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn,
      refreshExpiresAt,
    } = authService.generateTokens(user);

    // Rotate: replace old refresh token with a new one
    await authService.rotateSessionToken(refreshToken, newRefreshToken, refreshExpiresAt);

    res.status(200).json({ accessToken, refreshToken: newRefreshToken, expiresIn });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/session
 * Return the current user's profile from the JWT.
 * Requires: requireAuth middleware upstream.
 *
 * @type {import('express').RequestHandler}
 */
async function session(req, res, next) {
  try {
    const user = await authService.findUserById(req.user.id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    res.status(200).json({ user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
}

export { login, logout, refresh, session };
