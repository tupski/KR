/**
 * @file users.service.js
 * @description User management service layer.
 * All database operations go through the pg pool; no HTTP concerns here.
 */

import bcrypt from 'bcryptjs';
import { query } from '../../config/database.js';
import { NotFoundError, ValidationError } from '../../middleware/errorHandler.js';

const BCRYPT_ROUNDS = 12;

// ── Read queries ──────────────────────────────────────────────────────────────

/**
 * Get a single user by ID, joined with profile and role.
 *
 * @param {string} userId - UUID
 * @returns {Promise<object>} User with role and profile fields
 * @throws {NotFoundError} If user does not exist
 */
export async function getUserById(userId) {
  const result = await query(
    `SELECT
       u.id,
       u.email,
       u.created_at,
       up.full_name,
       up.phone,
       up.gender,
       ur.role
     FROM users u
     LEFT JOIN user_profiles up ON up.id = u.id
     LEFT JOIN user_roles    ur ON ur.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId],
  );

  if (!result.rows[0]) {
    throw new NotFoundError('User not found');
  }
  return result.rows[0];
}

/**
 * Get a single user by email address, joined with role.
 *
 * @param {string} email
 * @returns {Promise<object|null>} User row or null
 */
export async function getUserByEmail(email) {
  const result = await query(
    `SELECT
       u.id,
       u.email,
       u.created_at,
       up.full_name,
       up.phone,
       up.gender,
       ur.role
     FROM users u
     LEFT JOIN user_profiles up ON up.id = u.id
     LEFT JOIN user_roles    ur ON ur.user_id = u.id
     WHERE u.email = $1
     LIMIT 1`,
    [email],
  );
  return result.rows[0] ?? null;
}

/**
 * List all users with pagination (admin only).
 *
 * @param {{ page?: number, limit?: number }} opts
 * @returns {Promise<{ data: object[], total: number, page: number, limit: number }>}
 */
export async function listUsers({ page = 1, limit = 20 } = {}) {
  const safePage  = Math.max(1, Number(page)  || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const offset    = (safePage - 1) * safeLimit;

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT
         u.id,
         u.email,
         u.created_at,
         up.full_name,
         up.phone,
         up.gender,
         ur.role
       FROM users u
       LEFT JOIN user_profiles up ON up.id = u.id
       LEFT JOIN user_roles    ur ON ur.user_id = u.id
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [safeLimit, offset],
    ),
    query('SELECT COUNT(*) FROM users'),
  ]);

  return {
    data:  dataResult.rows,
    total: Number(countResult.rows[0].count),
    page:  safePage,
    limit: safeLimit,
  };
}

/**
 * Get the role of a user.
 *
 * @param {string} userId
 * @returns {Promise<string|null>} Role string or null
 */
export async function getUserRole(userId) {
  const result = await query(
    'SELECT role FROM user_roles WHERE user_id = $1 LIMIT 1',
    [userId],
  );
  return result.rows[0]?.role ?? null;
}

/**
 * Get location assignments for a user.
 *
 * @param {string} userId
 * @returns {Promise<string[]>} Array of location names
 */
export async function getUserLocationAssignments(userId) {
  const result = await query(
    'SELECT location_name FROM user_location_assignments WHERE user_id = $1 ORDER BY location_name',
    [userId],
  );
  return result.rows.map((r) => r.location_name);
}

// ── Write queries ─────────────────────────────────────────────────────────────

/**
 * Update a user's profile fields.
 *
 * @param {string} userId
 * @param {{ full_name?: string, phone?: string, gender?: string }} fields
 * @returns {Promise<object>} Updated profile row
 */
export async function updateUserProfile(userId, { full_name, phone, gender }) {
  const result = await query(
    `UPDATE user_profiles
     SET
       full_name = COALESCE($2, full_name),
       phone     = COALESCE($3, phone),
       gender    = COALESCE($4, gender)
     WHERE id = $1
     RETURNING *`,
    [userId, full_name ?? null, phone ?? null, gender ?? null],
  );

  if (!result.rows[0]) {
    throw new NotFoundError('User profile not found');
  }
  return result.rows[0];
}

/**
 * Replace all location assignments for a user (delete + insert in one transaction).
 *
 * @param {string} userId
 * @param {string[]} locationNames
 * @param {string} assignedBy - UUID of the admin performing the assignment
 * @returns {Promise<string[]>} New list of location names
 */
export async function setUserLocationAssignments(userId, locationNames, assignedBy) {
  if (!Array.isArray(locationNames)) {
    throw new ValidationError('locationNames must be an array');
  }

  // Use a pg client for the transaction
  const { pool } = await import('../../config/database.js');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      'DELETE FROM user_location_assignments WHERE user_id = $1',
      [userId],
    );

    if (locationNames.length > 0) {
      const placeholders = locationNames.map((_, i) => `($1, $${i + 2}, $${locationNames.length + 2})`).join(', ');
      await client.query(
        `INSERT INTO user_location_assignments (user_id, location_name, assigned_by)
         VALUES ${placeholders}`,
        [userId, ...locationNames, assignedBy],
      );
    }

    await client.query('COMMIT');
    return locationNames;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Create a new user with profile and role in a single transaction.
 *
 * @param {{ email: string, passwordHash: string, full_name: string, phone?: string, gender?: string, role?: string }} data
 * @returns {Promise<object>} Created user row
 */
export async function createUser({ email, passwordHash, full_name, phone, gender, role = 'karyawan' }) {
  const { pool } = await import('../../config/database.js');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, created_at`,
      [email, passwordHash],
    );
    const newUser = userResult.rows[0];

    await client.query(
      `INSERT INTO user_profiles (id, full_name, phone, gender)
       VALUES ($1, $2, $3, $4)`,
      [newUser.id, full_name, phone ?? null, gender ?? null],
    );

    await client.query(
      `INSERT INTO user_roles (user_id, role)
       VALUES ($1, $2)`,
      [newUser.id, role],
    );

    await client.query('COMMIT');
    return { ...newUser, full_name, phone, gender, role };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      throw new ValidationError('Email already in use');
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Update a user's profile and role.
 *
 * @param {string} userId
 * @param {{ full_name?: string, phone?: string, gender?: string, role?: string }} data
 * @returns {Promise<object>} Updated user row
 * @throws {NotFoundError} If user does not exist
 */
export async function updateUser(userId, { full_name, phone, gender, role }) {
  const { pool } = await import('../../config/database.js');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Update profile
    if (full_name !== undefined || phone !== undefined || gender !== undefined) {
      await client.query(
        `UPDATE user_profiles
         SET full_name = COALESCE($2, full_name),
             phone = COALESCE($3, phone),
             gender = COALESCE($4, gender)
         WHERE id = $1`,
        [userId, full_name, phone, gender],
      );
    }

    // Update role
    if (role !== undefined) {
      await client.query(
        `UPDATE user_roles SET role = $2 WHERE user_id = $1`,
        [userId, role],
      );
    }

    await client.query('COMMIT');

    // Return updated user
    return await getUserById(userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Delete a user by ID (cascade handles profiles, roles, sessions).
 *
 * @param {string} userId
 * @returns {Promise<void>}
 * @throws {NotFoundError} If user does not exist
 */
export async function deleteUser(userId) {
  const result = await query(
    'DELETE FROM users WHERE id = $1 RETURNING id',
    [userId],
  );
  if (!result.rows[0]) {
    throw new NotFoundError('User not found');
  }
}

/**
 * Update a user's password hash.
 *
 * @param {string} userId
 * @param {string} newPasswordHash - Bcrypt hash of the new password
 * @returns {Promise<void>}
 */
export async function resetUserPassword(userId, newPasswordHash) {
  const result = await query(
    'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id',
    [newPasswordHash, userId],
  );
  if (!result.rows[0]) {
    throw new NotFoundError('User not found');
  }
}

/**
 * Sign out all devices for a user by deleting all their sessions.
 *
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function signOutAllDevices(userId) {
  await query(
    'DELETE FROM sessions WHERE user_id = $1',
    [userId],
  );
}

/**
 * Toggle a location assignment for a user.
 *
 * @param {string} userId
 * @param {string} locationName
 * @param {boolean} assigned
 * @returns {Promise<void>}
 */
export async function toggleUserLocation(userId, locationName, assigned) {
  if (assigned) {
    // Add assignment
    await query(
      `INSERT INTO user_location_assignments (user_id, location_name)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, locationName],
    );
  } else {
    // Remove assignment
    await query(
      `DELETE FROM user_location_assignments
       WHERE user_id = $1 AND location_name = $2`,
      [userId, locationName],
    );
  }
}

/**
 * Hash a plain-text password with bcrypt.
 *
 * @param {string} plainPassword
 * @returns {Promise<string>} Bcrypt hash
 */
export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}
