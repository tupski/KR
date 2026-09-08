-- =============================================================================
-- prepare-target.sql
-- Menyiapkan PostgreSQL 16 "vanilla" agar DAPAT menerima restore dari dump
-- Supabase tanpa membawa seluruh platform Supabase (realtime/storage/graphql/
-- vault/pgbouncer).
--
-- Jalankan SEBELUM `npm run migration:db -- restore`.
-- Idempotent: aman dijalankan berulang.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ekstensi yang benar-benar dipakai aplikasi
--    pgcrypto  : gen_random_uuid() dipakai schema & fungsi aplikasi
--    uuid-ossp : dipakai sebagian default Supabase lama
--    pg_stat_statements : opsional (observability), di-skip jika tidak tersedia
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 2. Role yang dirujuk dump Supabase (OWNER TO ...).
--    Dump di-restore dengan --no-owner, tetapi beberapa fungsi SECURITY DEFINER
--    dan grant di dalam dump tetap menyebut role ini. Membuatnya mencegah error.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['supabase_admin','supabase_auth_admin','supabase_storage_admin',
                           'supabase_functions_admin','supabase_realtime_admin','supabase_read_only_user',
                           'authenticator','pgbouncer','postgres','supabase_replication_admin']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Schema 'auth' minimal.
--    Aplikasi TIDAK memakai GoTrue pada runtime self-hosted. Schema ini hanya
--    menampung:
--      a) tabel auth.users / auth.identities hasil restore (sumber hash password)
--      b) fungsi auth.uid()/auth.role()/auth.jwt()/auth.email() agar RLS policy,
--         view, dan fungsi SECURITY DEFINER lama tetap dapat di-restore.
--    Otorisasi efektif dipindahkan ke middleware Node.js — fungsi di bawah
--    hanya compatibility shim supaya SQL lama tidak error.
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

-- Tabel penampung identitas lama (diisi oleh restore dump).
CREATE TABLE IF NOT EXISTS auth.users (
    instance_id uuid,
    id uuid PRIMARY KEY,
    aud varchar(255),
    role varchar(255),
    email varchar(255),
    encrypted_password varchar(255),
    email_confirmed_at timestamptz,
    invited_at timestamptz,
    confirmation_token varchar(255),
    confirmation_sent_at timestamptz,
    recovery_token varchar(255),
    recovery_sent_at timestamptz,
    email_change_token_new varchar(255),
    email_change varchar(255),
    email_change_sent_at timestamptz,
    last_sign_in_at timestamptz,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamptz,
    updated_at timestamptz,
    phone text DEFAULT NULL,
    phone_confirmed_at timestamptz,
    phone_change text DEFAULT '',
    phone_change_token varchar(255) DEFAULT '',
    phone_change_sent_at timestamptz,
    email_change_token_current varchar(255) DEFAULT '',
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamptz,
    reauthentication_token varchar(255) DEFAULT '',
    reauthentication_sent_at timestamptz,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamptz,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check
        CHECK (email_change_confirm_status >= 0 AND email_change_confirm_status <= 2)
);

CREATE TABLE IF NOT EXISTS auth.identities (
    provider_id text,
    user_id uuid,
    identity_data jsonb,
    provider text,
    last_sign_in_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz,
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY
);

-- Compatibility shim: membaca klaim JWT dari GUC yang di-set Node.js (atau kosong).
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  )
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

-- -----------------------------------------------------------------------------
-- 4. Schema penampung lain yang dirujuk dump. Dibuat KOSONG.
--    Tidak dipakai runtime self-hosted; hanya agar restore tidak gagal.
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE SCHEMA IF NOT EXISTS graphql;
CREATE SCHEMA IF NOT EXISTS graphql_public;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;

-- supabase_vault TIDAK tersedia di PostgreSQL vanilla.
-- Buat stub schema + tabel minimal bila dump memuat referensi ke vault.decrypted_secrets.
CREATE TABLE IF NOT EXISTS vault.decrypted_secrets (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name text,
    description text,
    secret text,
    key_id text,
    nonce text,
    created_at timestamptz DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 5. Tabel auth NATIVE (dipakai runtime Node.js self-hosted)
-- -----------------------------------------------------------------------------
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
);

CREATE TABLE IF NOT EXISTS public.password_resets (
    id bigserial PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash varchar(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON public.password_resets(user_id);
