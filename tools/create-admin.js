#!/usr/bin/env node
/* eslint-env node */
/* global process */

/**
 * tools/create-admin.js — buat akun admin/super_admin pertama (fresh install)
 *
 * Runtime self-hosted TIDAK punya public signup (AUTH_ALLOW_PUBLIC_REGISTER=false).
 * Akun pertama harus dibuat lewat CLI ini ATAU migrasi (migration:db -- auth).
 *
 * Usage:
 *   DATABASE_URL=postgresql://kr_user:***@127.0.0.1:5432/kr_production \
 *     node tools/create-admin.js --email admin@kakaramaroom.com --password '...' [--role super_admin]
 *
 * Role valid: karyawan | admin | super_admin (default super_admin)
 * Password: minimal 8 karakter. TIDAK pernah di-log.
 */

import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const VALID_ROLES = new Set(['karyawan', 'admin', 'super_admin']);

function arg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const dbUrl = process.env.DATABASE_URL || process.env.MIGRATION_TARGET_DB_URL;
const email = arg('--email');
const password = arg('--password');
const role = arg('--role') || 'super_admin';

function fail(msg) {
  console.error(`[create-admin] ERROR: ${msg}`);
  process.exit(1);
}

if (!dbUrl) fail('DATABASE_URL (atau MIGRATION_TARGET_DB_URL) wajib diset.');
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('--email wajib dan harus format email valid.');
if (!password) fail('--password wajib diset.');
if (String(password).length < 8) fail('Password minimal 8 karakter.');
if (!VALID_ROLES.has(role)) fail(`Role tidak dikenal: ${role}. Valid: ${[...VALID_ROLES].join(', ')}.`);

const client = new pg.Client({ connectionString: dbUrl, connectionTimeoutMillis: 8000 });

async function main() {
  await client.connect();
  try {
    const normalized = String(email).trim().toLowerCase();

    // Ensure native auth tables exist (idempotent with prepare-target.sql).
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar(255) NOT NULL UNIQUE,
        password_hash varchar(255),
        full_name varchar(255),
        phone varchar(50),
        avatar_url text,
        require_password_reset boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.user_roles (
        id bigserial PRIMARY KEY,
        user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
        role varchar(50) NOT NULL DEFAULT 'karyawan',
        created_at timestamptz NOT NULL DEFAULT now()
      )`);

    const existing = await client.query('SELECT id FROM public.users WHERE LOWER(email) = LOWER($1)', [normalized]);
    let userId;
    if (existing.rows[0]) {
      // Idempotent: update password + role, jangan duplikasi.
      userId = existing.rows[0].id;
      const hash = await bcrypt.hash(String(password), 12);
      await client.query('UPDATE public.users SET password_hash = $1, require_password_reset = false, updated_at = now() WHERE id = $2', [hash, userId]);
      await client.query(
        `INSERT INTO public.user_roles (user_id, role) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role`,
        [userId, role]
      );
      console.log(`[create-admin] ✓ Akun ${normalized} diperbarui (role=${role}).`);
    } else {
      const hash = await bcrypt.hash(String(password), 12);
      const ins = await client.query(
        `INSERT INTO public.users (email, password_hash, require_password_reset)
         VALUES ($1, $2, false) RETURNING id`,
        [normalized, hash]
      );
      userId = ins.rows[0].id;
      await client.query(
        'INSERT INTO public.user_roles (user_id, role) VALUES ($1, $2)',
        [userId, role]
      );
      console.log(`[create-admin] ✓ Akun ${normalized} dibuat (role=${role}, id=${userId}).`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[create-admin] FATAL:', err.message);
  process.exit(1);
});
