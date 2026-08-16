-- =============================================================
-- Migration 011: Database Triggers untuk Notifikasi Event-based
-- Requires: 002_auth_tables.sql, 003_core_tables.sql, 004_notifications.sql
--
-- PERUBAHAN vs Supabase:
--   - Hapus SECURITY DEFINER, SET search_path, GRANT/REVOKE
--   - get_user_display_name: ganti auth.users → public.users
--   - notify_request_response: ganti auth.uid() → NEW.responded_by
--     (admin yang merespons sudah tersimpan di kolom responded_by)
--   - handle_new_transaction_notification: superseded oleh notify_new_checkin
--     (tetap disimpan untuk kompatibilitas, tapi trigger utama adalah notify_new_checkin)
-- =============================================================

-- =============================================================
-- Helper: ambil nama display user dari user_profiles atau public.users
-- Ganti auth.users → public.users
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_user_display_name(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (SELECT full_name FROM public.user_profiles WHERE id = p_user_id),
        (SELECT email    FROM public.users        WHERE id = p_user_id),
        'Pengguna'
    );
$$;

-- =============================================================
-- TRIGGER 1: Request baru → notifikasi ke admin & super_admin
-- =============================================================
CREATE OR REPLACE FUNCTION public.notify_new_request()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_title  text;
    v_body   text;
    v_dedupe text;
BEGIN
    v_title  := format('📋 Request Baru: %s', NEW.request_type);
    v_body   := format(
        '%s mengajukan request "%s" untuk lokasi %s pada %s.',
        NEW.employee_name,
        NEW.request_type,
        NEW.apartment_location,
        to_char((NEW.desired_date AT TIME ZONE 'Asia/Jakarta'), 'DD Mon YYYY')
    );
    v_dedupe := format('new_request:%s', NEW.id);

    INSERT INTO public.notifications (type, title, body, data, dedupe_key, audience_role)
    VALUES (
        'new_request', v_title, v_body,
        jsonb_build_object(
            'request_id',          NEW.id,
            'request_type',        NEW.request_type,
            'employee_name',       NEW.employee_name,
            'apartment_location',  NEW.apartment_location
        ),
        v_dedupe || ':admin', 'admin'
    )
    ON CONFLICT (dedupe_key) DO NOTHING;

    INSERT INTO public.notifications (type, title, body, data, dedupe_key, audience_role)
    VALUES (
        'new_request', v_title, v_body,
        jsonb_build_object(
            'request_id',          NEW.id,
            'request_type',        NEW.request_type,
            'employee_name',       NEW.employee_name,
            'apartment_location',  NEW.apartment_location
        ),
        v_dedupe || ':super_admin', 'super_admin'
    )
    ON CONFLICT (dedupe_key) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_request ON public.requests;
CREATE TRIGGER trg_notify_new_request
    AFTER INSERT ON public.requests
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_new_request();


-- =============================================================
-- TRIGGER 2: Status request berubah → notifikasi ke karyawan
-- PERUBAHAN: ganti auth.uid() → NEW.responded_by
-- Admin yang merespons sudah tersimpan di kolom responded_by
-- =============================================================
CREATE OR REPLACE FUNCTION public.notify_request_response()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_title        text;
    v_body         text;
    v_dedupe       text;
    v_admin_name   text;
    v_status_label text;
BEGIN
    -- Hanya trigger jika status berubah ke Approved atau Rejected
    IF NEW.status = OLD.status THEN RETURN NEW; END IF;
    IF NEW.status NOT IN ('Approved', 'Rejected') THEN RETURN NEW; END IF;
    IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

    -- Ambil nama admin yang merespons dari kolom responded_by
    -- (diisi oleh application layer saat update request)
    v_admin_name   := public.get_user_display_name(NEW.responded_by);
    v_status_label := CASE NEW.status
        WHEN 'Approved' THEN 'disetujui ✅'
        ELSE                 'ditolak ❌'
    END;

    v_title  := format('Request %s', v_status_label);
    v_body   := format(
        'Request "%s" untuk lokasi %s telah %s oleh %s.',
        NEW.request_type,
        NEW.apartment_location,
        v_status_label,
        v_admin_name
    );
    v_dedupe := format('request_response:%s:%s', NEW.id, NEW.status);

    -- Kirim ke user yang membuat request (target_user_id)
    INSERT INTO public.notifications (
        type, title, body, data, dedupe_key, target_user_id
    ) VALUES (
        'request_response', v_title, v_body,
        jsonb_build_object(
            'request_id',   NEW.id,
            'request_type', NEW.request_type,
            'status',       NEW.status,
            'admin_name',   v_admin_name
        ),
        v_dedupe,
        NEW.user_id
    )
    ON CONFLICT (dedupe_key) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_request_response ON public.requests;
CREATE TRIGGER trg_notify_request_response
    AFTER UPDATE OF status ON public.requests
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_request_response();


-- =============================================================
-- TRIGGER 3: Check-in baru → notifikasi ke admin & super_admin
-- =============================================================
CREATE OR REPLACE FUNCTION public.notify_new_checkin()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_title          text;
    v_body           text;
    v_dedupe         text;
    v_duration_label text;
    v_checkin_label  text;
BEGIN
    -- Label durasi: jika < 24 jam tampilkan dalam jam, ≥ 24 dalam malam
    v_duration_label := CASE
        WHEN NEW.rental_duration IS NULL THEN 'N/A'
        WHEN NEW.rental_duration < 24    THEN NEW.rental_duration::text || ' jam'
        ELSE (NEW.rental_duration / 24)::text || ' malam'
    END;

    v_checkin_label  := to_char(
        COALESCE(NEW.checkin_at, NEW.created_at) AT TIME ZONE 'Asia/Jakarta',
        'DD Mon YYYY HH24:MI'
    );

    v_title  := format('🏠 Check-in: %s', NEW.customer_name);
    v_body   := format(
        '%s check-in di %s - %s. Durasi: %s. Check-in: %s. Input oleh: %s.',
        NEW.customer_name,
        NEW.apartment_location,
        NEW.room_number,
        v_duration_label,
        v_checkin_label,
        NEW.input_by
    );
    v_dedupe := format('new_checkin:tx:%s', NEW.id);

    INSERT INTO public.notifications (type, title, body, data, dedupe_key, audience_role)
    VALUES (
        'new_checkin', v_title, v_body,
        jsonb_build_object(
            'transaction_id',      NEW.id,
            'customer_name',       NEW.customer_name,
            'apartment_location',  NEW.apartment_location,
            'room_number',         NEW.room_number,
            'checkin_at',          COALESCE(NEW.checkin_at, NEW.created_at),
            'rental_duration',     NEW.rental_duration,
            'input_by',            NEW.input_by
        ),
        v_dedupe || ':admin', 'admin'
    )
    ON CONFLICT (dedupe_key) DO NOTHING;

    INSERT INTO public.notifications (type, title, body, data, dedupe_key, audience_role)
    VALUES (
        'new_checkin', v_title, v_body,
        jsonb_build_object(
            'transaction_id',      NEW.id,
            'customer_name',       NEW.customer_name,
            'apartment_location',  NEW.apartment_location,
            'room_number',         NEW.room_number,
            'checkin_at',          COALESCE(NEW.checkin_at, NEW.created_at),
            'rental_duration',     NEW.rental_duration,
            'input_by',            NEW.input_by
        ),
        v_dedupe || ':super_admin', 'super_admin'
    )
    ON CONFLICT (dedupe_key) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_checkin ON public.transactions;
CREATE TRIGGER trg_notify_new_checkin
    AFTER INSERT ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_new_checkin();


-- =============================================================
-- TRIGGER 4: updated_at auto-update untuk tabel utama
-- =============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- transactions
DROP TRIGGER IF EXISTS trg_transactions_updated_at ON public.transactions;
CREATE TRIGGER trg_transactions_updated_at
    BEFORE UPDATE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- pengeluaran
DROP TRIGGER IF EXISTS trg_pengeluaran_updated_at ON public.pengeluaran;
CREATE TRIGGER trg_pengeluaran_updated_at
    BEFORE UPDATE ON public.pengeluaran
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- requests
DROP TRIGGER IF EXISTS trg_requests_updated_at ON public.requests;
CREATE TRIGGER trg_requests_updated_at
    BEFORE UPDATE ON public.requests
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- tagihan_bulanan
DROP TRIGGER IF EXISTS trg_tagihan_bulanan_updated_at ON public.tagihan_bulanan;
CREATE TRIGGER trg_tagihan_bulanan_updated_at
    BEFORE UPDATE ON public.tagihan_bulanan
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- users
DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
