-- =============================================================
-- Migration 008: Activity Logs
-- Requires: 002_auth_tables.sql (public.users, public.user_profiles)
-- =============================================================

-- Tabel: activity_logs
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id         BIGSERIAL PRIMARY KEY,
    user_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
    user_name  VARCHAR(255),
    role       VARCHAR(50),
    action     VARCHAR(255) NOT NULL,
    details    TEXT,
    metadata   JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id    ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action     ON public.activity_logs(action);

-- =============================================================
-- RPC: log_activity
-- Catat aktivitas user; ambil nama & role dari user_profiles
-- p_user_id eksplisit — tidak pakai auth.uid()
-- =============================================================
CREATE OR REPLACE FUNCTION public.log_activity(
    p_user_id  uuid,
    p_action   text,
    p_details  text    DEFAULT NULL,
    p_metadata jsonb   DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_name text;
    v_role      text;
BEGIN
    SELECT full_name, role
    INTO v_user_name, v_role
    FROM public.user_profiles
    WHERE id = p_user_id;

    INSERT INTO public.activity_logs (
        user_id, user_name, role, action, details, metadata
    ) VALUES (
        p_user_id, v_user_name, v_role, p_action, p_details, p_metadata
    );
END;
$$;
