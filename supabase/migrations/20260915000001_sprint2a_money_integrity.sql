-- =============================================================
-- MIGRATION: Sprint 2A — M-5 money integrity (Supabase/Postgres)
--
-- Menambah CHECK non-negatif untuk semua kolom uang. Idempoten
-- (pola DO-block; Postgres tidak punya ADD CONSTRAINT IF NOT EXISTS).
--
-- Strategi data historis (NON-DESTRUKTIF):
-- - Constraint dibuat NOT VALID: INSERT/UPDATE baru langsung ditegakkan,
--   migrasi TIDAK gagal walau data lama mengandung nilai negatif.
-- - JANGAN ubah/hapus data produksi diam-diam. Jalankan query audit di
--   SECURITY_REMEDIATION_SPRINT_2A.md, bersihkan manual, lalu VALIDATE.
-- =============================================================

DO $$ BEGIN
  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_cash_amount_nonnegative_check CHECK (cash_amount >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_transfer_amount_nonnegative_check CHECK (transfer_amount >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_marketing_fee_nonnegative_check CHECK (marketing_fee >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_deposit_cash_nonnegative_check CHECK (deposit_cash >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_deposit_transfer_nonnegative_check CHECK (deposit_transfer >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.pengeluaran
    ADD CONSTRAINT pengeluaran_jumlah_nonnegative_check CHECK (jumlah >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tagihan_bulanan
    ADD CONSTRAINT tagihan_bulanan_amount_nonnegative_check CHECK (amount >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tagihan_fee_lunas
    ADD CONSTRAINT tagihan_fee_lunas_total_fee_nonnegative_check CHECK (total_fee >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.tagihan_fee_lunas
    ADD CONSTRAINT tagihan_fee_lunas_customer_count_nonnegative_check CHECK (customer_count >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tagihan_fee_lunas_items
    ADD CONSTRAINT tagihan_fee_lunas_items_fee_amount_nonnegative_check CHECK (fee_amount >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- requests.amount nullable — NULL lolos CHECK otomatis.
DO $$ BEGIN
  ALTER TABLE public.requests
    ADD CONSTRAINT requests_amount_nonnegative_check CHECK (amount >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
