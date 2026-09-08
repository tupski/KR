/* eslint-env node */
/* global process */

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';

/**
 * Native authentication service (replaces Supabase GoTrue at runtime).
 *
 * Password-hash migration policy (documented decision):
 * - Supabase GoTrue stores bcrypt hashes in auth.users.encrypted_password
 *   ($2a$ / $2b$ prefix). bcryptjs can verify those hashes directly, so the
 *   migration tool copies the hash verbatim into users.password_hash and
 *   users can keep their existing passwords.
 * - Any account whose hash cannot be verified (different format, empty, or
 *   explicitly invalidated during migration) gets require_password_reset=true
 *   and must complete a reset flow. We never reverse or downgrade hashing.
 */

const BCRYPT_ROUNDS = 12;

export const PUBLIC_USER_COLUMNS = 'u.id, u.email, u.full_name, u.phone, u.avatar_url, u.require_password_reset';

export async function findUserByEmail(email) {
  const res = await query(
    `SELECT ${PUBLIC_USER_COLUMNS}, u.password_hash, COALESCE(ur.role, 'karyawan') AS role
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
      WHERE LOWER(u.email) = LOWER($1)
      LIMIT 1`,
    [String(email || '').trim()]
  );
  return res.rows[0] || null;
}

export async function findUserById(id) {
  const res = await query(
    `SELECT ${PUBLIC_USER_COLUMNS}, COALESCE(ur.role, 'karyawan') AS role
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
      WHERE u.id = $1::uuid
      LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

export async function verifyPassword(plainPassword, passwordHash) {
  if (!passwordHash) return false;
  try {
    return await bcrypt.compare(String(plainPassword || ''), String(passwordHash));
  } catch (_e) {
    // Malformed hash -> treat as invalid, never throw upward with hash details.
    return false;
  }
}

export async function hashPassword(plainPassword) {
  return bcrypt.hash(String(plainPassword), BCRYPT_ROUNDS);
}

/**
 * Generic message for all login failures: do not reveal whether the account
 * exists or whether the password was wrong.
 */
export const LOGIN_ERROR_MESSAGE = 'Email atau password salah.';

export async function login(email, password) {
  const user = await findUserByEmail(email);
  if (!user) {
    // Perform a dummy comparison to reduce user-enumeration timing signal.
    await verifyPassword(password, '$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpDLd4yY8u6E.N8yJzXyBk0l1pQ2q');
    return { ok: false, error: LOGIN_ERROR_MESSAGE };
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return { ok: false, error: LOGIN_ERROR_MESSAGE };

  if (user.require_password_reset) {
    return { ok: false, requiresPasswordReset: true, userId: user.id, error: 'Password wajib direset sebelum login.' };
  }

  await query('UPDATE users SET updated_at = NOW() WHERE id = $1::uuid', [user.id]);

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      avatar_url: user.avatar_url,
      role: user.role || 'karyawan',
    },
  };
}

const VALID_ROLES = new Set(['karyawan', 'admin', 'super_admin']);

/**
 * Create a user. Role is validated against a fixed allowlist; callers must
 * pass an already-authorized role (the HTTP layer never forwards a
 * browser-supplied role without an admin authorization check).
 */
export async function createUser({ email, password, fullName = null, phone = null, role = 'karyawan', requirePasswordReset = false }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !password) {
    throw new Error('Email dan password wajib diisi.');
  }
  if (!VALID_ROLES.has(role)) {
    throw new Error(`Role tidak dikenal: ${role}`);
  }

  const passwordHash = password ? await hashPassword(password) : null;

  const userRes = await query(
    `INSERT INTO users (email, password_hash, full_name, phone, require_password_reset)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, full_name, phone, require_password_reset, created_at`,
    [normalizedEmail, passwordHash, fullName, phone, Boolean(requirePasswordReset)]
  );
  const user = userRes.rows[0];

  await query(
    `INSERT INTO user_roles (user_id, role)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role`,
    [user.id, role]
  );

  return { ...user, role };
}

/** Password reset flow for migrated accounts (require_password_reset=true). */
export async function createPasswordResetToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 jam
  await query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at)
     VALUES ($1::uuid, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
  return { token, expiresAt };
}

export async function consumePasswordResetToken(token, newPassword) {
  const tokenHash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
  const res = await query(
    `SELECT id, user_id FROM password_resets
      WHERE token_hash = $1 AND expires_at > NOW() AND used_at IS NULL
      LIMIT 1`,
    [tokenHash]
  );
  const row = res.rows[0];
  if (!row) return { ok: false, error: 'Token reset tidak valid atau kedaluwarsa.' };

  if (String(newPassword || '').length < 8) {
    return { ok: false, error: 'Password baru minimal 8 karakter.' };
  }

  const passwordHash = await hashPassword(newPassword);
  await query(
    `UPDATE users SET password_hash = $1, require_password_reset = FALSE, updated_at = NOW() WHERE id = $2::uuid`,
    [passwordHash, row.user_id]
  );
  await query(`UPDATE password_resets SET used_at = NOW() WHERE id = $1`, [row.id]);
  return { ok: true, userId: row.user_id };
}
