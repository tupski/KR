/* eslint-env node */
/* global process */

import { query } from '../db/index.js';

export default async function apiRoutes(fastify, _opts) {
  // GET /api/transactions
  fastify.get('/api/transactions', async (req, reply) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
      const offset = (page - 1) * limit;

      const countRes = await query('SELECT COUNT(*) as total FROM transactions');
      const total = Number(countRes.rows[0]?.total || 0);

      const res = await query(
        `SELECT * FROM transactions
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      return reply.send({
        data: res.rows,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Gagal mengambil data transaksi.' });
    }
  });

  // GET /api/lokasi
  fastify.get('/api/lokasi', async (_req, reply) => {
    try {
      const res = await query('SELECT * FROM lokasi_apartemen ORDER BY name ASC');
      return reply.send(res.rows);
    } catch (_err) {
      return reply.code(500).send({ error: 'Gagal mengambil lokasi.' });
    }
  });

  // GET /api/kamar
  fastify.get('/api/kamar', async (_req, reply) => {
    try {
      const res = await query('SELECT * FROM nomor_kamar ORDER BY name ASC');
      return reply.send(res.rows);
    } catch (_err) {
      return reply.code(500).send({ error: 'Gagal mengambil nomor kamar.' });
    }
  });

  // GET /api/pengeluaran
  fastify.get('/api/pengeluaran', async (req, reply) => {
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
      const res = await query('SELECT * FROM pengeluaran ORDER BY tanggal DESC LIMIT $1', [limit]);
      return reply.send(res.rows);
    } catch (_err) {
      return reply.code(500).send({ error: 'Gagal mengambil data pengeluaran.' });
    }
  });

  // GET /api/system-settings
  fastify.get('/api/system-settings', async (_req, reply) => {
    try {
      const res = await query('SELECT * FROM system_settings');
      return reply.send(res.rows);
    } catch (_err) {
      return reply.code(500).send({ error: 'Gagal mengambil pengaturan.' });
    }
  });
}
