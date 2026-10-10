/* eslint-env node */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Sprint 2A / M-5: verifikasi statis CHECK constraint non-negatif ─────────
// Membuktikan constraint ADA di kedua jalur skema (native + Supabase) dan
// bersifat idempoten (pola DO-block / NOT VALID). Efektivitas di DB live
// tetap butuh manual verification (lihat SECURITY_REMEDIATION_SPRINT_2A.md).

const here = path.dirname(fileURLToPath(import.meta.url));
const nativeSchema = fs.readFileSync(path.resolve(here, '../../server/db/schema.sql'), 'utf8');
const supabaseMigration = fs.readFileSync(
  path.resolve(here, '../../supabase/migrations/20260915000001_sprint2a_money_integrity.sql'),
  'utf8'
);

// Kolom uang yang WAJIB punya constraint non-negatif.
const NATIVE_CONSTRAINTS = [
  'transactions_cash_amount_nonnegative_check',
  'transactions_transfer_amount_nonnegative_check',
  'transactions_marketing_fee_nonnegative_check',
  'transactions_deposit_cash_nonnegative_check',
  'transactions_deposit_transfer_nonnegative_check',
  'pengeluaran_jumlah_nonnegative_check',
  'tagihan_bulanan_amount_nonnegative_check',
  'tagihan_fee_lunas_total_fee_nonnegative_check',
  'tagihan_fee_lunas_customer_count_nonnegative_check',
  'requests_amount_nonnegative_check',
];

const SUPABASE_CONSTRAINTS = [
  ...NATIVE_CONSTRAINTS,
  'tagihan_fee_lunas_items_fee_amount_nonnegative_check',
];

describe('M-5 — money integrity constraints (native schema)', () => {
  it.each(NATIVE_CONSTRAINTS)('%s ada di server/db/schema.sql', (name) => {
    expect(nativeSchema).toContain(name);
  });

  it('semua constraint native memakai CHECK (... >= 0)', () => {
    const matches = nativeSchema.match(/CHECK \([^)]*>=\s*0\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(NATIVE_CONSTRAINTS.length);
  });

  it('constraint kolom existing ditambah via DO-block idempoten (ADD CONSTRAINT)', () => {
    expect(nativeSchema).toContain('ADD CONSTRAINT');
    expect(nativeSchema).toContain('EXCEPTION WHEN duplicate_object THEN NULL');
  });

  it('N-1: kolom deposit_refund_proof_url ada di skema native (idempoten)', () => {
    expect(nativeSchema).toContain('deposit_refund_proof_url');
    expect(nativeSchema).toMatch(/ADD COLUMN IF NOT EXISTS deposit_refund_proof_url/);
  });
});

describe('M-5 — money integrity constraints (Supabase migration)', () => {
  it.each(SUPABASE_CONSTRAINTS)('%s ada di migrasi Supabase', (name) => {
    expect(supabaseMigration).toContain(name);
  });

  it('migrasi idempoten (duplicate_object ditangani)', () => {
    const guards = supabaseMigration.match(/EXCEPTION WHEN duplicate_object THEN NULL/g) || [];
    expect(guards.length).toBeGreaterThanOrEqual(SUPABASE_CONSTRAINTS.length);
  });

  it('NON-DESTRUKTIF: memakai NOT VALID, tidak menghapus/mengubah data', () => {
    expect(supabaseMigration).toContain('NOT VALID');
    expect(supabaseMigration).not.toMatch(/DELETE\s+FROM/i);
    expect(supabaseMigration).not.toMatch(/UPDATE\s+public\./i);
    expect(supabaseMigration).not.toMatch(/DROP\s+TABLE/i);
    expect(supabaseMigration).not.toMatch(/ALTER COLUMN/i);
  });

  it('tidak menambah constraint pada kolom fee_amount native yang tidak ada tabelnya', () => {
    // fee_amount hanya ada di jalur Supabase (tagihan_fee_lunas_items).
    expect(supabaseMigration).toContain('tagihan_fee_lunas_items_fee_amount_nonnegative_check');
    expect(nativeSchema).not.toContain('tagihan_fee_lunas_items_fee_amount_nonnegative_check');
  });
});
