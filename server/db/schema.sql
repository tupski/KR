-- Self-Hosted PostgreSQL Schema for KR (Kakaramaroom) App
-- Independent of Supabase runtime

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table replacing auth.users
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    full_name VARCHAR(255),
    phone VARCHAR(50),
    avatar_url TEXT,
    require_password_reset BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- User roles mapping
CREATE TABLE IF NOT EXISTS public.user_roles (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'karyawan',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE(user_id)
);

-- Master data
CREATE TABLE IF NOT EXISTS public.lokasi_apartemen (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.nomor_kamar (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    lokasi VARCHAR(255) NOT NULL REFERENCES public.lokasi_apartemen(name) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'available',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE(name, lokasi)
);

CREATE TABLE IF NOT EXISTS public.karyawan_list (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.marketing_list (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Transactions & Finansial
CREATE TABLE IF NOT EXISTS public.transactions (
    id SERIAL PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    marketing_name VARCHAR(255) NOT NULL,
    rental_duration INTEGER NOT NULL,
    shift VARCHAR(50),
    input_by VARCHAR(255) NOT NULL,
    apartment_location VARCHAR(255) NOT NULL REFERENCES public.lokasi_apartemen(name),
    room_number VARCHAR(255) NOT NULL,
    cash_amount DECIMAL(15,2) DEFAULT 0,
    transfer_amount DECIMAL(15,2) DEFAULT 0,
    transfer_to VARCHAR(255),
    marketing_fee DECIMAL(15,2) DEFAULT 0,
    ktp_image_url TEXT,
    transfer_proof_url TEXT,
    user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    checkout_at TIMESTAMP WITH TIME ZONE,
    checkin_at TIMESTAMP WITH TIME ZONE,
    deposit_cash DECIMAL(15,2) DEFAULT 0,
    deposit_transfer DECIMAL(15,2) DEFAULT 0,
    deposit_returned_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.pengeluaran_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pengeluaran (
    id SERIAL PRIMARY KEY,
    nama_pengeluaran VARCHAR(255) NOT NULL,
    jumlah DECIMAL(15,2) NOT NULL,
    tanggal DATE NOT NULL,
    keterangan TEXT,
    category VARCHAR(100),
    apartment_location VARCHAR(255),
    room_number VARCHAR(255),
    user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tagihan_bulanan (
    id SERIAL PRIMARY KEY,
    apartment_location VARCHAR(255) NOT NULL REFERENCES public.lokasi_apartemen(name),
    room_number VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    due_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'unpaid',
    paid_at TIMESTAMP WITH TIME ZONE,
    proof_url TEXT,
    user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tagihan_fee_lunas (
    id SERIAL PRIMARY KEY,
    marketing_name VARCHAR(255) NOT NULL,
    customer_count INTEGER NOT NULL,
    total_fee DECIMAL(15,2) NOT NULL,
    transactions_detail JSONB,
    proof_url TEXT,
    paid_at TIMESTAMP WITH TIME ZONE NOT NULL,
    user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.requests (
    id SERIAL PRIMARY KEY,
    employee_name VARCHAR(255) NOT NULL,
    apartment_location VARCHAR(255) NOT NULL REFERENCES public.lokasi_apartemen(name),
    request_type VARCHAR(255) NOT NULL,
    description TEXT,
    amount DECIMAL(15,2),
    desired_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending',
    user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Notifications & Push
CREATE TABLE IF NOT EXISTS public.notifications (
    id SERIAL PRIMARY KEY,
    type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    data JSONB,
    dedupe_key VARCHAR(255) UNIQUE,
    audience_role VARCHAR(50),
    audience_user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notification_reads (
    id SERIAL PRIMARY KEY,
    notification_id INTEGER NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE(notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.system_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) NOT NULL UNIQUE,
    value JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
