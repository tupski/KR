/**
 * @file errorHandler.js
 * @description Custom error classes and a global Express error-handling middleware.
 *
 * Usage:
 *   throw new NotFoundError('Room not found');
 *   throw new ValidationError('Invalid input', { field: 'email' });
 */

import { env } from '../config/env.js';

// ── Custom Error Classes ─────────────────────────────────────────────────────

/**
 * Base application error. All custom errors extend this.
 */
class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Machine-readable error code
   * @param {unknown} [details] - Optional extra context (only shown in dev)
   */
  constructor(message, statusCode, code, details = undefined) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/** 400 — Invalid request payload or parameters */
class ValidationError extends AppError {
  constructor(message = 'Validation failed', details) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/** 401 — Missing or invalid authentication credentials */
class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/** 403 — Authenticated but not permitted */
class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

/** 404 — Resource not found */
class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

// ── Global Error Handler ─────────────────────────────────────────────────────

/**
 * Express global error handler (4-argument signature required by Express).
 *
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next - Required by Express; intentionally unused
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const isDev = env.NODE_ENV === 'development';

  // Log every server error
  if (!err.statusCode || err.statusCode >= 500) {
    console.error('❌ Unhandled error:', err);
  }

  const statusCode = err.statusCode ?? 500;
  const code       = err.code ?? 'INTERNAL_SERVER_ERROR';
  const message    = err.message ?? 'An unexpected error occurred';

  const payload = {
    error: {
      code,
      message,
      ...(isDev && err.details !== undefined ? { details: err.details } : {}),
      ...(isDev ? { stack: err.stack } : {}),
    },
  };

  res.status(statusCode).json(payload);
}

export {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  errorHandler,
};
