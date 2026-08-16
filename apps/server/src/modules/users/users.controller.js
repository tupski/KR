/**
 * @file users.controller.js
 * @description HTTP request handlers for user management endpoints.
 * Validates input with Zod, delegates business logic to users.service.
 */

import { z } from 'zod';
import * as usersService from './users.service.js';
import { ValidationError } from '../../middleware/errorHandler.js';

// ── Input schemas ─────────────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  phone:     z.string().max(30).optional().nullable(),
  gender:    z.enum(['male', 'female', 'other']).optional().nullable(),
});

const createUserSchema = z.object({
  email:     z.string().email('Invalid email'),
  password:  z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().min(1).max(100),
  phone:     z.string().max(30).optional().nullable(),
  gender:    z.enum(['male', 'female', 'other']).optional().nullable(),
  role:      z.enum(['super_admin', 'admin', 'karyawan']).default('karyawan'),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

const locationAssignmentsSchema = z.object({
  locations: z.array(z.string().min(1)).min(0),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validate request body against a Zod schema.
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
 * GET /api/users
 * List all users (admin/super_admin only).
 *
 * @type {import('express').RequestHandler}
 */
export async function listUsers(req, res, next) {
  try {
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 20;
    const result = await usersService.listUsers({ page, limit });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users/me
 * Get the authenticated user's own profile.
 *
 * @type {import('express').RequestHandler}
 */
export async function getMe(req, res, next) {
  try {
    const user = await usersService.getUserById(req.user.id);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users/me/role
 * Polling endpoint — return current role for the authenticated user.
 *
 * @type {import('express').RequestHandler}
 */
export async function getMyRole(req, res, next) {
  try {
    const role = await usersService.getUserRole(req.user.id);
    res.status(200).json({ role });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users/:id
 * Get any user by ID (admin/super_admin only).
 *
 * @type {import('express').RequestHandler}
 */
export async function getUserById(req, res, next) {
  try {
    const user = await usersService.getUserById(req.params.id);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/users/me/profile
 * Update the authenticated user's profile.
 *
 * @type {import('express').RequestHandler}
 */
export async function updateMyProfile(req, res, next) {
  try {
    const data    = validate(updateProfileSchema, req.body);
    const profile = await usersService.updateUserProfile(req.user.id, data);
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users/:id/locations
 * Get location assignments for a user.
 *
 * @type {import('express').RequestHandler}
 */
export async function getUserLocations(req, res, next) {
  try {
    const locations = await usersService.getUserLocationAssignments(req.params.id);
    res.status(200).json({ locations });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/users/:id/locations
 * Replace location assignments for a user (super_admin only).
 *
 * @type {import('express').RequestHandler}
 */
export async function setUserLocations(req, res, next) {
  try {
    const { locations } = validate(locationAssignmentsSchema, req.body);
    const result = await usersService.setUserLocationAssignments(
      req.params.id,
      locations,
      req.user.id,
    );
    res.status(200).json({ locations: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/users
 * Create a new user (super_admin only).
 *
 * @type {import('express').RequestHandler}
 */
export async function createUser(req, res, next) {
  try {
    const { email, password, full_name, phone, gender, role } = validate(createUserSchema, req.body);
    const passwordHash = await usersService.hashPassword(password);
    const user = await usersService.createUser({ email, passwordHash, full_name, phone, gender, role });
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/users/:id
 * Delete a user (super_admin only).
 *
 * @type {import('express').RequestHandler}
 */
export async function deleteUser(req, res, next) {
  try {
    await usersService.deleteUser(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/users/:id/reset-password
 * Reset a user's password (super_admin only).
 *
 * @type {import('express').RequestHandler}
 */
export async function resetUserPassword(req, res, next) {
  try {
    const { newPassword } = validate(resetPasswordSchema, req.body);
    const newPasswordHash = await usersService.hashPassword(newPassword);
    await usersService.resetUserPassword(req.params.id, newPasswordHash);
    res.status(200).json({ message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
}
