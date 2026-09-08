/* eslint-env node */
/* global process */

import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';

export async function findUserByEmail(email) {
  const res = await query(
    `SELECT u.id, u.email, u.password_hash, u.full_name, u.phone, u.avatar_url, ur.role
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     WHERE LOWER(u.email) = LOWER($1)
     LIMIT 1`,
    [email]
  );
  return res.rows[0] || null;
}

export async function findUserById(id) {
  const res = await query(
    `SELECT u.id, u.email, u.full_name, u.phone, u.avatar_url, ur.role
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

export async function verifyPassword(plainPassword, passwordHash) {
  if (!passwordHash) return false;
  return bcrypt.compare(plainPassword, passwordHash);
}

export async function createUser({ email, password, fullName, phone, role = 'karyawan' }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const client = await query('BEGIN');
  try {
    const userRes = await query(
      `INSERT INTO users (email, password_hash, full_name, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, phone, created_at`,
      [email.toLowerCase(), passwordHash, fullName, phone]
    );
    const user = userRes.rows[0];

    await query(
      `INSERT INTO user_roles (user_id, role)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role`,
      [user.id, role]
    );

    await query('COMMIT');
    return { ...user, role };
  } catch (err) {
    await query('ROLLBACK');
    throw err;
  }
}
