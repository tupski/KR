import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Static verification (Sprint 1): membuktikan migrasi keamanan memuat
// kontrol yang benar. Verifikasi efektif di DB live tetap butuh
// manual checklist (lihat SECURITY_REMEDIATION_SPRINT_1.md).

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(here, '../../supabase/migrations/20260915000000_sprint1_security_hardening.sql');
const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('C-1 — user_roles RLS hardening', () => {
  it('menghapus semua policy lama user_roles (schema + migrasi)', () => {
    const drops = sql.match(/DROP POLICY IF EXISTS "[^"]+" ON public\.user_roles;/g) || [];
    expect(drops.length).toBeGreaterThanOrEqual(8);
    expect(sql).toContain('DROP POLICY IF EXISTS "Enable insert user roles for authenticated users" ON public.user_roles;');
    expect(sql).toContain('DROP POLICY IF EXISTS "Enable update user roles for authenticated users" ON public.user_roles;');
    expect(sql).toContain('DROP POLICY IF EXISTS "Enable delete user roles for authenticated users" ON public.user_roles;');
  });

  it('TIDAK membuat policy INSERT/UPDATE/DELETE user_roles untuk authenticated', () => {
    // Satu-satunya policy yang dibuat adalah SELECT self & SELECT super_admin
    const creates = sql.match(/CREATE POLICY "[^"]+" ON public\.user_roles[\s\S]*?;/g) || [];
    expect(creates.length).toBe(2);
    for (const c of creates) {
      expect(c).toContain('FOR SELECT');
    }
    expect(sql).toContain('CREATE POLICY "user_roles_select_self"');
    expect(sql).toContain('CREATE POLICY "user_roles_select_super_admin"');
  });

  it('policy SELECT self mengikat auth.uid() = user_id', () => {
    const self = sql.match(/CREATE POLICY "user_roles_select_self"[\s\S]*?;/)[0];
    expect(self).toContain('auth.uid() = user_id');
    expect(self).toContain("auth.role() = 'authenticated'");
  });

  it('is_super_admin() dijadikan SECURITY DEFINER dengan search_path dipatok (anti rekurusi RLS)', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.is_super_admin\(\)[\s\S]*?\$\$;/)[0];
    expect(fn).toContain('SECURITY DEFINER');
    expect(fn).toContain('SET search_path = public');
  });
});

describe('H-2 — pay_tagihan_bulanan hardening', () => {
  it('menolak caller tanpa role admin/super_admin', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.pay_tagihan_bulanan\([\s\S]*?\n\$\$;/m)[0];
    expect(fn).toContain("ur.role IN ('admin', 'super_admin')");
    expect(fn).toContain('Hanya admin yang dapat menandai tagihan lunas');
  });

  it('menolak tagihan yang sudah lunas (anti replay duplikat pengeluaran)', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.pay_tagihan_bulanan\([\s\S]*?\n\$\$;/m)[0];
    expect(fn).toContain("IF v_row.status = 'paid' THEN");
    expect(fn).toContain('Tagihan sudah lunas');
  });

  it('memakai SELECT ... FOR UPDATE sebelum mutasi (atomicity + anti race)', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.pay_tagihan_bulanan\([\s\S]*?\n\$\$;/m)[0];
    expect(fn).toMatch(/FOR UPDATE;/);
  });

  it('tetap SECURITY DEFINER dengan search_path dipatok + GRANT terkontrol', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.pay_tagihan_bulanan\([\s\S]*?\n\$\$;/m)[0];
    expect(fn).toContain('SECURITY DEFINER');
    expect(fn).toContain('SET search_path = public');
    const grant = sql.match(/GRANT EXECUTE ON FUNCTION public\.pay_tagihan_bulanan\(bigint, text\) TO authenticated;/);
    expect(grant).toBeTruthy();
  });

  it('tetap mempertahankan generasi tagihan recurring', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.pay_tagihan_bulanan\([\s\S]*?\n\$\$;/m)[0];
    expect(fn).toContain('is_recurring');
    expect(fn).toContain('recurring_parent_id');
  });
});

describe('H-3 — pay_fee_items hardening', () => {
  it('menolak caller tanpa role admin/super_admin', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.pay_fee_items\([\s\S]*?\n\$\$;/m)[0];
    expect(fn).toContain("ur.role IN ('admin', 'super_admin')");
    expect(fn).toContain('Hanya admin yang dapat membayar fee marketing');
  });

  it('total fee hanya dihitung dari transaksi yang BELUM dibayar (anti duplikat expense)', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.pay_fee_items\([\s\S]*?\n\$\$;/m)[0];
    expect(fn).toContain('NOT EXISTS (\n      SELECT 1 FROM public.tagihan_fee_lunas_items tfli');
    expect(fn).toContain('jsonb_array_length(v_actual_transactions) = 0');
  });

  it('pengeluaran & receipt hanya dibuat jika ada item baru', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.pay_fee_items\([\s\S]*?\n\$\$;/m)[0];
    expect(fn).toContain('IF v_items_inserted > 0 AND v_total_fee > 0 THEN');
    expect(fn).toContain('IF v_items_inserted > 0 THEN');
  });

  it('dedupe per transaction_id dipertahankan (ON CONFLICT DO NOTHING)', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.pay_fee_items\([\s\S]*?\n\$\$;/m)[0];
    expect(fn).toContain('ON CONFLICT (transaction_id) DO NOTHING');
  });
});

describe('M-1 — bucket legacy ditutup dari publik', () => {
  it('mengubah visibility ktp_images/transfer_proofs/tagihan_proofs menjadi private', () => {
    expect(sql).toContain(
      "UPDATE storage.buckets\nSET public = false\nWHERE id IN ('ktp_images', 'transfer_proofs', 'tagihan_proofs');"
    );
  });

  it('TIDAK menghapus bucket atau data', () => {
    expect(sql).not.toMatch(/DROP BUCKET|DELETE FROM storage\.objects/i);
  });
});
