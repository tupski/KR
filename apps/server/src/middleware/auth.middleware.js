/**
 * @file auth.middleware.js
 * @description JWT verification middleware and role-based access control.
 *
 * Usage:
 *   router.get('/protected', requireAuth, handler);
 *   router.delete('/admin', requireAuth, requireRole('admin'), handler);
 */

import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError, ForbiddenError } from './errorHandler.js';

/**
 * Extract the Bearer token from the Authorization header.
 *
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractBearerToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7); // strip "Bearer "
}

/**
 * Middleware — verifies the JWT access token and injects `req.user`.
 *
 * @type {import('express').RequestHandler}
 */
async function requireAuth(req, _res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      throw new UnauthorizedError('Missing authorization token');
    }

    /** @type {{ sub: string, email: string, role: string }} */
    const payload = jwt.verify(token, env.JWT_SECRET);

    req.user = {
      id:    payload.sub,
      email: payload.email,
      role:  payload.role,
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
    } else if (err instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
    } else {
      next(err);
    }
  }
}

/**
 * Middleware factory — ensures the authenticated user has one of the allowed roles.
 * Must be used after `requireAuth`.
 *
 * @param {...string} roles - Allowed role names (e.g. 'admin', 'super_admin')
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.delete('/users/:id', requireAuth, requireRole('admin', 'super_admin'), handler);
 */
function requireRole(...roles) {
  return function roleGuard(req, _res, next) {
    if (!req.user) {
      return next(new UnauthorizedError('Not authenticated'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(`Role '${req.user.role}' is not permitted`));
    }
    next();
  };
}

export { requireAuth, requireRole };
