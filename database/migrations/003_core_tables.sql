-- =============================================================
-- Migration 003: Core Application Tables
-- Requires: 002_auth_tables.sql (public.users)
-- =============================================================

-- Tabel: lokasi_apartemen
-- Kolom total_rooms ditambahkan sekaligus (dari analytics migration 20260601)
CREATE TABLE IF NOT EXISTS public.lokasi_apartemen (
    name        VARCHAR(255) PRIMARY KEY,
    total_rooms INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Tabel: nomor_kamar (master list kamar per lokasi, dipakai analytics)
CREATE TABLE IF NOT EXISTS public.nomor_kamar (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    lokasi     VARCHAR(255) REFERENCES public.lokasi_apartemen(name) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(name, lokasi)
);

CREATE INDEX IF NOT EXISTS idx_nomor_kamar_lokasi ON public.nomor_kamar(lokasi);

-- Tabel: transactions
-- Kolom lengkap: gabungan semua ALTER TABLE dari seluruh migration Supabase.
-- Catatan: analytics menggunakan cash_amount / transfer_amount (bukan payment_cash /
-- payment_transfer). Kedua alias disediakan agar kompatibel.
CREATE TABLE IF NOT EXISTS public.transactions (
    id                      BIGSERIAL PRIMARY KEY,
    user_id                 UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
    customer_name           TEXT NOT NULL,
    apartment_location      VARCHAR(255) REFERENCES public.lokasi_apartemen(name),
    room_number             TEXT,
    check_in                DATE,
    check_out               DATE,
    checkin_at              TIMESTAMPTZ,
    duration_days           INTEGER,
    -- Durasi dalam JAM untuk analytics (rental_duration)
    rental_duration         INTEGER,
    -- Shift kerja karyawan (Pagi / Malam / Long) untuk analytics
    shift                   TEXT,
    -- Nama karyawan yang input transaksi untuk analytics
    input_by                TEXT,
    -- Kolom pembayaran — digunakan analytics sebagai cash_amount / transfer_amount
    cash_amount             NUMERIC(15,2) DEFAULT 0,
    transfer_amount         NUMERIC(15,2) DEFAULT 0,
    -- Alias lama (backward compat), disimpan sebagai generated columns
    payment_cash            NUMERIC(15,2) GENERATED ALWAYS AS (cash_amount) STORED,
    payment_transfer        NUMERIC(15,2) GENERATED ALWAYS AS (transfer_amount) STORED,
    -- Harga & total
    price_per_day           NUMERIC(15,2) DEFAULT 0,
    total_price             NUMERIC(15,2) DEFAULT 0,
    -- Deposit
    deposit_cash            NUMERIC(15,2) DEFAULT 0,
    deposit_transfer        NUMERIC(15,2) DEFAULT 0,
    deposit_returned_at     TIMESTAMPTZ DEFAULT NULL,
    deposit_refund_proof_url TEXT DEFAULT NULL,
    -- Marketing
    marketing_name          TEXT,
    marketing_fee           NUMERIC(15,2) DEFAULT 0,
    -- Berkas
    ktp_image_url           TEXT,
    transfer_proof_url      TEXT,
    -- Lainnya
    guest_source            TEXT,
    notes                   TEXT,
    created_at              TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at              TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id            ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at         ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_apartment_location ON public.transactions(apartment_location);
CREATE INDEX IF NOT EXISTS idx_transactions_check_in           ON public.transactions(check_in);
CREATE INDEX IF NOT EXISTS idx_transactions_check_out          ON public.transactions(check_out);
CREATE INDEX IF NOT EXISTS idx_transactions_checkin_at         ON public.transactions(checkin_at);
CREATE INDEX IF NOT EXISTS idx_transactions_marketing_name     ON public.transactions(marketing_name);

-- Tabel: pengeluaran_categories
CREATE TABLE IF NOT EXISTS public.pengeluaran_categories (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

INSERT INTO public.pengeluaran_categories (name) VALUES
    ('Operasional'), ('Fee Marketing'), ('Tagihan Unit'), ('Lainnya')
ON CONFLICT (name) DO NOTHING;

-- Tabel: pengeluaran
CREATE TABLE IF NOT EXISTS public.pengeluaran (
    id                BIGSERIAL PRIMARY KEY,
    user_id           UUID REFERENCES public.users(id) ON DELETE SET NULL,
    nama_pengeluaran  TEXT NOT NULL,
    jumlah            NUMERIC(15,2) NOT NULL DEFAULT 0,
    tanggal           DATE NOT NULL,
    keterangan        TEXT,
    category          TEXT REFERENCES public.pengeluaran_categories(name) ON DELETE SET NULL,
    -- Kolom opsional untuk filter per lokasi/kamar (dipakai get_category_summary)
    apartment_location VARCHAR(255) REFERENCES public.lokasi_apartemen(name) ON DELETE SET NULL,
    room_number       TEXT,
    created_at        TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at        TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pengeluaran_tanggal  ON public.pengeluaran(tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_pengeluaran_user_id  ON public.pengeluaran(user_id);
CREATE INDEX IF NOT EXISTS idx_pengeluaran_category ON public.pengeluaran(category);

-- Tabel: requests
CREATE TABLE IF NOT EXISTS public.requests (
    id                 BIGSERIAL PRIMARY KEY,
    user_id            UUID REFERENCES public.users(id) ON DELETE SET NULL,
    employee_name      TEXT NOT NULL,
    request_type       TEXT NOT NULL,
    apartment_location VARCHAR(255) REFERENCES public.lokasi_apartemen(name),
    desired_date       TIMESTAMPTZ,
    notes              TEXT,
    status             TEXT DEFAULT 'Pending',
    responded_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
    response_notes     TEXT,
    responded_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at         TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_user_id    ON public.requests(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON public.requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_status     ON public.requests(status);

-- Tabel: user_location_assignments
CREATE TABLE IF NOT EXISTS public.user_location_assignments (
    id            BIGSERIAL PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    location_name VARCHAR(255) NOT NULL REFERENCES public.lokasi_apartemen(name) ON DELETE CASCADE,
    assigned_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
    assigned_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
    UNIQUE(user_id, location_name)
);

CREATE INDEX IF NOT EXISTS idx_user_location_assignments_user_id       ON public.user_location_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_location_assignments_location_name ON public.user_location_assignments(location_name);
