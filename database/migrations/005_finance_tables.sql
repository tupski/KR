-- =============================================================
-- Migration 005: Finance Tables
-- Requires: 002_auth_tables.sql, 003_core_tables.sql
-- =============================================================

-- Tabel: tagihan_fee_lunas
-- Rekap pembayaran fee marketing (satu baris per batch pembayaran)
CREATE TABLE IF NOT EXISTS public.tagihan_fee_lunas (
    id                  BIGSERIAL PRIMARY KEY,
    marketing_name      TEXT NOT NULL,
    customer_count      INTEGER DEFAULT 0,
    total_fee           NUMERIC(15,2) DEFAULT 0,
    transactions_detail JSONB DEFAULT '[]'::jsonb,
    proof_url           TEXT,
    paid_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_date           DATE GENERATED ALWAYS AS ((paid_at AT TIME ZONE 'Asia/Jakarta')::date) STORED,
    user_id             UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tagihan_fee_lunas_paid_date  ON public.tagihan_fee_lunas(paid_date);
CREATE INDEX IF NOT EXISTS idx_tagihan_fee_lunas_marketing  ON public.tagihan_fee_lunas(marketing_name);

-- Tabel: tagihan_fee_lunas_items
-- Satu baris per transaksi yang telah dibayar fee-nya (UNIQUE per transaction_id)
CREATE TABLE IF NOT EXISTS public.tagihan_fee_lunas_items (
    id             BIGSERIAL PRIMARY KEY,
    transaction_id BIGINT NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    marketing_name TEXT NOT NULL,
    fee_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
    paid_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_date      DATE GENERATED ALWAYS AS ((paid_at AT TIME ZONE 'Asia/Jakarta')::date) STORED,
    paid_by        UUID NOT NULL REFERENCES public.users(id),
    proof_url      TEXT,
    created_at     TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_tagihan_fee_lunas_items_paid_date_marketing
    ON public.tagihan_fee_lunas_items(paid_date, marketing_name);
CREATE INDEX IF NOT EXISTS idx_tagihan_fee_lunas_items_marketing_paid_date
    ON public.tagihan_fee_lunas_items(marketing_name, paid_date);

-- Tabel: tagihan_bulanan
-- Tagihan unit bulanan; mendukung recurring (auto-generate tagihan berikutnya)
CREATE TABLE IF NOT EXISTS public.tagihan_bulanan (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             UUID REFERENCES public.users(id) ON DELETE SET NULL,
    apartment_location  VARCHAR(255) REFERENCES public.lokasi_apartemen(name),
    room_number         TEXT,
    amount              NUMERIC(15,2) NOT NULL DEFAULT 0,
    due_date            DATE,
    status              TEXT DEFAULT 'unpaid',
    paid_at             TIMESTAMPTZ,
    proof_url           TEXT,
    is_recurring        BOOLEAN NOT NULL DEFAULT FALSE,
    recurring_parent_id BIGINT REFERENCES public.tagihan_bulanan(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tagihan_bulanan_status   ON public.tagihan_bulanan(status);
CREATE INDEX IF NOT EXISTS idx_tagihan_bulanan_unit_due ON public.tagihan_bulanan(apartment_location, room_number, due_date);
CREATE INDEX IF NOT EXISTS idx_tagihan_bulanan_due_date ON public.tagihan_bulanan(due_date);
