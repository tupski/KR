/* eslint-env node */
/* global process */

/**
 * Authentication & authorization middleware.
 *
 * Security model:
 * - Identity comes ONLY from the verified JWT (HTTP-only cookie / Authorization header).
 *   Values sent by the browser in the body (userId, role, etc.) are NEVER trusted.
 * - Role is re-read from the database on each request for authorization decisions
 *   so that a role downgrade takes effect immediately (the old Supabase RLS
 *   evaluated role live; a stale JWT claim must not grant privilege).
 * - Origin is validated for credentialed mutating requests (CSRF defense in depth
 *   alongside SameSite=Lax cookies).
 */

import { query } from '../db/index.js';

export const ROLE_HIERARCHY = { karyawan: 1, admin: 2, super_admin: 3 };

/**
 * Verify JWT and attach req.authUser = { id, email, role }.
 * Role is resolved from the database (user_roles joined to user identity),
 * never from a browser-controlled field.
 */
export async function authenticate(req, reply) {
  try {
    await req.jwtVerify();
  } catch (_err) {
    return reply.code(401).send({ error: 'Sesi tidak valid atau telah kadaluarsa.' });
  }

  const sub = req.user?.sub;
  if (!sub) {
    return reply.code(401).send({ error: 'Token tidak berisi identitas.' });
  }

  // Resolve current role from DB. Tolerate either the migrated `auth`-style
  // user tables (users/user_roles) or the legacy Supabase layout
  // (user_roles keyed by user_id UUID + user_profiles).
  let row = null;
  try {
    const res = await query(
      `SELECT ur.role
         FROM user_roles ur
        WHERE ur.user_id = $1::uuid
        LIMIT 1`,
      [sub]
    );
    row = res.rows[0] || null;
  } catch (err) {
    req.log.error({ err: err.message }, 'authenticate: gagal membaca role');
    return reply.code(500).send({ error: 'Gagal memverifikasi sesi.' });
  }

  req.authUser = {
    id: sub,
    email: req.user?.email || null,
    role: row?.role || 'karyawan',
  };
}

export function requireRole(...roles) {
  const allowed = roles.filter((r) => typeof r === 'string' && r.length > 0);
  return async function roleGuard(req, reply) {
    if (!req.authUser) {
      return reply.code(401).send({ error: 'Autentikasi diperlukan.' });
    }
    const has = allowed.includes(req.authUser.role);
    if (!has) {
      // Do not reveal which roles exist.
      return reply.code(403).send({ error: 'Anda tidak memiliki izin untuk aksi ini.' });
    }
  };
}

export function requireAdmin() {
  return requireRole('admin', 'super_admin');
}

export function requireSuperAdmin() {
  return requireRole('super_admin');
}

/**
 * CSRF / origin defense for credentialed mutating requests.
 * SameSite=Lax already blocks cross-site POST from forms on other origins in
 * modern browsers; this adds an explicit Origin/Referer allowlist check so a
 * permissive proxy config cannot reintroduce the risk.
 */
export function originGuard(config) {
  const allowed = new Set((config.corsOrigins || []).map((o) => o.replace(/\/+$/, '')));
  const appOrigin = String(config.appUrl || '').replace(/\/+$/, '');
  if (appOrigin) allowed.add(appOrigin);

  return async function checkOrigin(req, reply) {
    if (!config.csrfOriginCheck) return;
    const method = String(req.method || '').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
    if (!req.authUser) return; // unauthenticated requests cannot carry a session to steal

    const origin = req.headers.origin;
    const referer = req.headers.referer;
    let candidate = null;
    if (origin) candidate = String(origin).replace(/\/+$/, '');
    else if (referer) {
      try {
        candidate = new URL(String(referer)).origin;
      } catch (_e) {
        candidate = null;
      }
    }

    // Same-origin requests from the served SPA may omit Origin in some clients;
    // when Origin is present it must be allowlisted.
    if (candidate && !allowed.has(candidate)) {
      req.log.warn({ origin: candidate }, 'originGuard: origin ditolak');
      return reply.code(403).send({ error: 'Origin permintaan tidak diizinkan.' });
    }
  };
}

/** Constant-time-ish comparison to avoid timing leaks on shared secrets. */
export function safeEqualSecret(a, b) {
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  if (sa.length !== sb.length || sa.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i++) diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  return diff === 0;
}

/** Bearer / ?secret= auth for cron endpoints (push + notification generation). */
export function requireCronSecret(config) {
  return async function cronGuard(req, reply) {
    const required = config.notifCronSecret;
    if (!required) {
      return reply.code(500).send({ error: 'Env NOTIF_CRON_SECRET belum diset.' });
    }
    const authHeader = String(req.headers.authorization || '');
    const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    const fromQuery = String(req.query?.secret || '');
    const provided = bearer || fromQuery;
    if (!safeEqualSecret(provided, required)) {
      return reply.code(401).send({ error: 'Unauthorized.' });
    }
  };
}
