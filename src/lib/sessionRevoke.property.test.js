/**
 * Property-Based Tests for Session Revocation (Logout All Devices)
 *
 * Feature: auth-sessions
 * Property: Migration SQL harus mencerminkan kontrak revoke sesi
 *
 * Validates:
 * - admin RPC memakai SECURITY DEFINER + guard is_super_admin
 * - self RPC memakai SECURITY DEFINER + scoping auth.uid()
 * - Kedua RPC menghapus dari auth.sessions (cascade ke auth.refresh_tokens)
 * - Kedua RPC di-GRANT EXECUTE ke role authenticated (bukan PUBLIC)
 *
 * Membaca file migrasi nyata supabase/migrations/20260701_logout_all_devices.sql
 * dan meng-assert properti strukturalnya.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(here, '../../supabase/migrations/20260701_logout_all_devices.sql');
const sql = readFileSync(migrationPath, 'utf8');

const extractFn = (sqlText, name) => {
  const start = sqlText.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = sqlText.indexOf('$$;', start);
  return start === -1 ? null : sqlText.slice(start, end + 3);
};

const adminFn = extractFn(sql, 'admin_sign_out_user');
const selfFn = extractFn(sql, 'sign_out_own_devices');

describe('sessionRevoke — Property: migrasi logout semua device', () => {
  it('Property: kedua RPC terdefinisi dan memakai SECURITY DEFINER', () => {
    expect(adminFn).not.toBeNull();
    expect(selfFn).not.toBeNull();
    expect(adminFn).toContain('SECURITY DEFINER');
    expect(selfFn).toContain('SECURITY DEFINER');
  });

  it('Property: admin RPC WAJIB punya guard is_super_admin', () => {
    expect(adminFn).toContain('IF NOT public.is_super_admin() THEN');
    expect(adminFn).toContain('RAISE EXCEPTION');
  });

  it('Property: self RPC memakai auth.uid() sebagai scope, tanpa guard admin', () => {
    expect(selfFn).toContain('DELETE FROM auth.sessions WHERE user_id = auth.uid();');
    expect(selfFn).not.toContain('is_super_admin');
  });

  it('Property: kedua RPC menghapus dari auth.sessions', () => {
    expect(adminFn).toContain('DELETE FROM auth.sessions WHERE user_id = p_target_user_id;');
    expect(selfFn).toContain('DELETE FROM auth.sessions');
  });

  it('Property: GRANT EXECUTE ke authenticated, REVOKE dari PUBLIC', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.admin_sign_out_user(uuid) FROM PUBLIC;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.admin_sign_out_user(uuid) TO authenticated;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.sign_out_own_devices() FROM PUBLIC;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.sign_out_own_devices() TO authenticated;');
  });
});
