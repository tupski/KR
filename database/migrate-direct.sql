-- =============================================================
-- Direct Migration SQL Script
-- Ports data from Supabase backup schema to new clean schema
-- =============================================================

-- Start transaction for rollback safety
BEGIN;

-- Step 1: Create staging schema to preserve existing data
DROP SCHEMA IF EXISTS old_data CASCADE;
CREATE SCHEMA old_data;

-- Move existing public tables to staging (preserve data)
DO $$
DECLARE
    tbl record;
BEGIN
    FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I SET SCHEMA old_data', tbl.tablename);
    END LOOP;
END $$;

-- Step 2: Run migrations to create clean schema
-- Run these via psql -f database/migrations/*.sql separately
-- Or embed them here...

-- Step 3: Port data from old_data to new public tables

-- Users: Copy from auth.users (via old_data backup)
INSERT INTO public.users (id, email, password_hash, created_at, updated_at)
SELECT 
    id, 
    email, 
    COALESCE(encrypted_password, '') as password_hash,
    COALESCE(created_at, now()) as created_at,
    COALESCE(updated_at, now()) as updated_at
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Add role column to users (CRITICAL for auth service)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE public.users ADD COLUMN role TEXT DEFAULT 'karyawan';
    END IF;
END $$;

-- Populate role from user_profiles or user_roles
UPDATE public.users u
SET role = COALESCE(
    (SELECT role FROM old_data.user_roles WHERE user_id = u.id LIMIT 1),
    (SELECT role FROM old_data.user_profiles WHERE id = u.id LIMIT 1),
    'karyawan'
);

-- lokasi_apartemen
INSERT INTO public.lokasi_apartemen (name, total_rooms, created_at)
SELECT name, total_rooms, created_at
FROM old_data.lokasi_apartemen
ON CONFLICT (name) DO NOTHING;

-- user_profiles
INSERT INTO public.user_profiles (id, email, full_name, phone, gender, role, updated_at)
SELECT 
    id, email, full_name, phone, gender, 
    COALESCE(role, 'karyawan') as role,
    COALESCE(updated_at, now()) as updated_at
FROM old_data.user_profiles
ON CONFLICT (id) DO NOTHING;

-- user_roles
INSERT INTO public.user_roles (user_id, role, updated_at)
SELECT 
    user_id, 
    COALESCE(role, 'karyawan') as role,
    now() as updated_at
FROM old_data.user_roles
ON CONFLICT (user_id) DO NOTHING;

-- transactions (exclude generated columns)
INSERT INTO public.transactions (
    id, user_id, customer_name, apartment_location, room_number,
    checkin_at, rental_duration, shift, input_by,
    cash_amount, transfer_amount, marketing_name, marketing_fee,
    ktp_image_url, transfer_proof_url, created_at, updated_at,
    deposit_cash, deposit_transfer, deposit_returned_at, deposit_refund_proof_url,
    check_in, check_out, duration_days, price_per_day, total_price,
    guest_source, notes
)
SELECT 
    id, user_id, customer_name, apartment_location, room_number,
    checkin_at, rental_duration, shift, input_by,
    cash_amount, transfer_amount, marketing_name, marketing_fee,
    ktp_image_url, transfer_proof_url, created_at, updated_at,
    deposit_cash, deposit_transfer, deposit_returned_at, deposit_refund_proof_url,
    check_in, check_out, duration_days, price_per_day, total_price,
    guest_source, notes
FROM old_data.transactions;

-- Update sequence
SELECT setval('public.transactions_id_seq', COALESCE((SELECT MAX(id) FROM public.transactions), 1));

-- activity_logs
INSERT INTO public.activity_logs (id, user_id, user_name, role, action, details, metadata, created_at)
SELECT id, user_id, user_name, role, action, details, metadata, created_at
FROM old_data.activity_logs;

SELECT setval('public.activity_logs_id_seq', COALESCE((SELECT MAX(id) FROM public.activity_logs), 1));

-- requests
INSERT INTO public.requests (
    id, user_id, employee_name, request_type, apartment_location,
    desired_date, notes, status, responded_by, response_notes, responded_at,
    created_at, updated_at
)
SELECT 
    id, user_id, employee_name, request_type, apartment_location,
    desired_date, notes, status, responded_by, response_notes, responded_at,
    created_at, updated_at
FROM old_data.requests;

SELECT setval('public.requests_id_seq', COALESCE((SELECT MAX(id) FROM public.requests), 1));

-- tagihan_bulanan
INSERT INTO public.tagihan_bulanan (
    id, apartment_location, month, year, billing_date,
    pdam_amount, listrik_amount, service_amount, other_amount,
    pdam_proof_url, listrik_proof_url, other_description,
    status, created_at, updated_at
)
SELECT 
    id, apartment_location, month, year, billing_date,
    pdam_amount, listrik_amount, service_amount, other_amount,
    pdam_proof_url, listrik_proof_url, other_description,
    status, created_at, updated_at
FROM old_data.tagihan_bulanan;

SELECT setval('public.tagihan_bulanan_id_seq', COALESCE((SELECT MAX(id) FROM public.tagihan_bulanan), 1));

-- Step 4: Validation
DO $$
DECLARE
    users_count int;
    transactions_count int;
    activity_logs_count int;
BEGIN
    SELECT COUNT(*) INTO users_count FROM public.users;
    SELECT COUNT(*) INTO transactions_count FROM public.transactions;
    SELECT COUNT(*) INTO activity_logs_count FROM public.activity_logs;
    
    RAISE NOTICE 'Migration counts:';
    RAISE NOTICE '  users: %', users_count;
    RAISE NOTICE '  transactions: %', transactions_count;
    RAISE NOTICE '  activity_logs: %', activity_logs_count;
END $$;

-- Commit the transaction
COMMIT;

-- Step 5: Clean up (run separately if validation passes)
-- DROP SCHEMA IF EXISTS old_data CASCADE;
