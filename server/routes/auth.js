/* eslint-env node */
/* global process */

import { findUserByEmail, findUserById, verifyPassword, createUser } from '../services/auth.js';

export default async function authRoutes(fastify, _opts) {
  // POST /api/auth/login
  fastify.post('/api/auth/login', async (req, reply) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return reply.code(400).send({ error: 'Email dan password wajib diisi.' });
    }

    try {
      const user = await findUserByEmail(email);
      if (!user) {
        return reply.code(401).send({ error: 'Email atau password salah.' });
      }

      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) {
        return reply.code(401).send({ error: 'Email atau password salah.' });
      }

      const payload = {
        sub: user.id,
        email: user.email,
        role: user.role || 'karyawan',
      };

      const token = fastify.jwt.sign(payload, { expiresIn: '7d' });

      reply.setCookie('token', token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 hari
      });

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          phone: user.phone,
          avatar_url: user.avatar_url,
          role: user.role || 'karyawan',
        },
        token,
      });
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Gagal melakukan otentikasi.' });
    }
  });

  // GET /api/auth/me
  fastify.get('/api/auth/me', async (req, reply) => {
    try {
      await req.jwtVerify();
      const user = await findUserById(req.user.sub);
      if (!user) {
        return reply.code(404).send({ error: 'Pengguna tidak ditemukan.' });
      }
      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          phone: user.phone,
          avatar_url: user.avatar_url,
          role: user.role || 'karyawan',
        },
      });
    } catch (_err) {
      return reply.code(401).send({ error: 'Sesi tidak valid atau telah kadaluarsa.' });
    }
  });

  // POST /api/auth/logout
  fastify.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie('token', { path: '/' });
    return reply.send({ ok: true, message: 'Berhasil keluar.' });
  });

  // POST /api/auth/register (Admin/Super Admin only or initial setup)
  fastify.post('/api/auth/register', async (req, reply) => {
    const { email, password, fullName, phone, role } = req.body || {};
    if (!email || !password) {
      return reply.code(400).send({ error: 'Email dan password wajib diisi.' });
    }

    try {
      const existing = await findUserByEmail(email);
      if (existing) {
        return reply.code(400).send({ error: 'Email sudah terdaftar.' });
      }

      const user = await createUser({ email, password, fullName, phone, role });
      return reply.code(201).send({ ok: true, user });
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Gagal merestorasi/mendaftar pengguna.' });
    }
  });
}
