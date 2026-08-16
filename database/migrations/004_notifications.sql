-- =============================================================
-- Migration 004: Notifications & Announcements
-- Requires: 002_auth_tables.sql (public.users)
-- =============================================================

-- Tabel: push_subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id         BIGSERIAL PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL,
    p256dh     TEXT,
    auth       TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

-- Tabel: notifications
-- audience_role: 'admin' | 'super_admin' | 'karyawan' | NULL (semua)
-- target_user_id: untuk notifikasi spesifik satu user
CREATE TABLE IF NOT EXISTS public.notifications (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type             TEXT NOT NULL,
    title            TEXT NOT NULL,
    body             TEXT,
    data             JSONB DEFAULT '{}'::jsonb,
    audience_role    TEXT,
    target_user_id   UUID REFERENCES public.users(id) ON DELETE CASCADE,
    -- Kolom alias: audience_user_id dipakai oleh trigger notify_request_response
    audience_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    dedupe_key       TEXT UNIQUE,
    created_at       TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at      ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_audience_role   ON public.notifications(audience_role);
CREATE INDEX IF NOT EXISTS idx_notifications_target_user_id  ON public.notifications(target_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_audience_user_id ON public.notifications(audience_user_id);

-- Tabel: notification_hidden
CREATE TABLE IF NOT EXISTS public.notification_hidden (
    notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    hidden_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_hidden_user_id ON public.notification_hidden(user_id, hidden_at DESC);

-- Tabel: notification_preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id       UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    push_enabled  BOOLEAN NOT NULL DEFAULT true,
    types_enabled JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabel: announcements
CREATE TABLE IF NOT EXISTS public.announcements (
    id         BIGSERIAL PRIMARY KEY,
    title      TEXT NOT NULL,
    content    TEXT,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    is_active  BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_announcements_is_active  ON public.announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON public.announcements(created_at DESC);
