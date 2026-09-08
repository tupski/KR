/* eslint-env node */
/* global process */

import { login, findUserById, createPasswordResetToken, consumePasswordResetToken } from '../services/auth.js';
import { requireAdmin, requireRole, originGuard } from '../middleware/auth.js';

/**
 * Native auth routes (Supabase GoTrue replacement).
 *
 * Security model:
 *  - HTTP-only cookie session (SameSite=lax, Secure in production).
 *  - Role is re-resolved from DB in the authenticate middleware; JWT claims
 *    from the browser are never trusted for authorization.
 *  - Public registration is DISABLED by default (AUTH_ALLOW_PUBLIC_REGISTER).
 *    Accounts are created by admins via POST /api/auth/admin/users.
 *  - Login failures return one generic message (no account enumeration).
 */
export default async function authRoutes(fastify, _opts) {
  const cfg = fastify.appConfig;
  const cookieOpts = {
    path: '/',
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: cfg.cookieSameSite,
    maxAge: 12 * 60 * 60, // selaras JWT_EXPIRES_IN default
  };

  // POST /api/auth/login
  fastify.post('/login', {
    config: { rateLimit: { max: cfg.rateLimit.authMax, timeWindow: cfg.rateLimit.authWindow } },
    preHandler: [originGuard(cfg)],
  }, async (req, reply) => {
    const { email, password } = req.body || {};
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return reply.code(400).send({ error: 'Email dan password wajib diisi.' });
    }
    if (password.length > 200) {
      return reply.code(400).send({ error: 'Password terlalu panjang.' });
    }

    try {
      const result = await login(email, password);
      if (!result.ok) {
        if (result.requiresPasswordReset) {
          return reply.code(403).send({
            error: result.error,
            requiresPasswordReset: true,
            resetToken: result.resetToken || undefined,
          });
        }
        return reply.code(401).send({ error: result.error });
      }

      const payload = { sub: result.user.id, email: result.user.email };
      const token = fastify.jwt.sign(payload);

      reply.setCookie('token', token, cookieOpts);
      return reply.send({ user: result.user, token });
    } catch (err) {
      req.log.error({ err: err.message }, 'login error');
      return reply.code(500).send({ error: 'Gagal melakukan otentikasi.' });
    }
  });

  // GET /api/auth/me
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const user = await findUserById(req.authUser.id);
    if (!user) return reply.code(404).send({ error: 'Pengguna tidak ditemukan.' });
    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        avatar_url: user.avatar_url,
        role: user.role,
        require_password_reset: user.require_password_reset,
      },
    });
  });

  // PATCH /api/auth/me — user updates own profile (NOT role)
  fastify.patch('/me', {
    preHandler: [fastify.authenticate, originGuard(cfg)],
  }, async (req, reply) => {
    const { full_name, phone, avatar_url } = req.body || {};
    const { query } = await import('../db/index.js');
    await query(
      `UPDATE users SET
         full_name = COALESCE($1, full_name),
         phone     = COALESCE($2, phone),
         avatar_url= COALESCE($3, avatar_url),
         updated_at = NOW()
       WHERE id = $4::uuid`,
      [
        typeof full_name === 'string' ? full_name.slice(0, 255) : null,
        typeof phone === 'string' ? phone.slice(0, 50) : null,
        typeof avatar_url === 'string' ? avatar_url.slice(0, 2000) : null,
        req.authUser.id,
      ]
    );
    const user = await findUserById(req.authUser.id);
    return reply.send({ user });
  });

  // POST /api/auth/logout
  fastify.post('/logout', { preHandler: [originGuard(cfg)] }, async (_req, reply) => {
    reply.clearCookie('token', { path: '/' });
    return reply.send({ ok: true, message: 'Berhasil keluar.' });
  });

  // POST /api/auth/password-reset/request — untuk akun hasil migrasi yang
  // ditandai require_password_reset. Di produksi operator/admin yang memicu;
  // token dikembalikan HANYA kepada admin yang terautentikasi, bukan publik.
  fastify.post('/password-reset/request', {
    preHandler: [fastify.authenticate, requireAdmin, originGuard(cfg)],
  }, async (req, reply) => {
    const { userId } = req.body || {};
    if (!userId) return reply.code(400).send({ error: 'userId wajib diisi.' });
    const user = await findUserById(userId);
    if (!user) return reply.code(404).send({ error: 'Pengguna tidak ditemukan.' });
    const { token, expiresAt } = await createPasswordResetToken(userId);
    req.log.info({ userId }, 'password reset token dibuat oleh admin');
    return reply.send({ token, expiresAt });
  });

  // POST /api/auth/password-reset/confirm
  fastify.post('/password-reset/confirm', {
    preHandler: [originGuard(cfg)],
  }, async (req, reply) => {
    const { token, newPassword } = req.body || {};
    const result = await consumePasswordResetToken(token, newPassword);
    if (!result.ok) return reply.code(400).send({ error: result.error });
    return reply.send({ ok: true });
  });

  // POST /api/auth/register — HANYA bila AUTH_ALLOW_PUBLIC_REGISTER=true,
  // selalu role 'karyawan' (role dari body diabaikan), atau admin-only.
  fastify.post('/register', {
    preHandler: [originGuard(cfg)],
  }, async (req, reply) => {
    const allowPublic = cfg.bootstrap.allowPublicRegister;
    if (!allowPublic) {
      // Without the flag: admin-only account creation with explicit role.
      try {
        await fastify.authenticate(req, reply);
        if (reply.sent) return reply;
        const guard = requireAdmin();
        await guard(req, reply);
        if (reply.sent) return reply;
      } catch (_e) {
        return reply.code(403).send({ error: 'Pendaftaran publik dinonaktifkan.' });
      }
    }

    const { email, password, fullName, phone, role } = req.body || {};
    if (!email || !password) {
      return reply.code(400).send({ error: 'Email dan password wajib diisi.' });
    }
    if (String(password).length < 8) {
      return reply.code(400).send({ error: 'Password minimal 8 karakter.' });
    }

    // Role dari body hanya dihormati untuk admin yang terautentikasi.
    const effectiveRole = allowPublic ? 'karyawan' : (['karyawan', 'admin', 'super_admin'].includes(role) ? role : 'karyawan');

    try {
      const { createUser } = await import('../services/auth.js');
      const existing = await (await import('../services/auth.js')).findUserByEmail(email);
      if (existing) {
        // Generic message to avoid enumeration.
        return reply.code(400).send({ error: 'Pendaftaran gagal. Periksa kembali data Anda.' });
      }
      const user = await createUser({ email, password, fullName, phone, role: effectiveRole });
      return reply.code(201).send({ ok: true, user: { id: user.id, email: user.email, role: user.role } });
    } catch (err) {
      req.log.error({ err: err.message }, 'register error');
      return reply.code(500).send({ error: 'Gagal membuat pengguna.' });
    }
  });

  // GET /api/auth/admin/users — list users (admin+)
  fastify.get('/admin/users', {
    preHandler: [fastify.authenticate, requireRole('admin', 'super_admin')],
  }, async (_req, reply) => {
    const { query } = await import('../db/index.js');
    const res = await query(
      `SELECT u.id, u.email, u.full_name, u.phone, u.avatar_url, u.require_password_reset,
              u.created_at, COALESCE(ur.role, 'karyawan') AS role
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id
        ORDER BY u.created_at DESC
        LIMIT 500`
    );
    return reply.send(res.rows);
  });
}
