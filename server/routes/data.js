/* eslint-env node */
/**
 * server/routes/data.js
 *
 * Generic data API with explicit authorization.
 *
 *   POST /api/data/query  body: { table, op, columns, filters, order, limit, offset }
 *   POST /api/data/rpc    body: { fn, params }
 *
 * Auth: JWT via @fastify/jwt. The token cookie ('token') is read manually
 * because the SPA sends credentials:'include' with an httpOnly cookie and
 * may not set an Authorization header. Actor (userId, role) is taken ONLY
 * from the verified token payload — never from the request body.
 *
 * Registration is done by the parent in server/index.js:
 *   fastify.register(dataRoutes);   // after fastifyJwt is registered
 */

import { query, runAsActor } from '../db/index.js';
import { createRepository, PolicyError } from '../db/repository.js';
import { getRpcPolicy, RPC_POLICIES } from '../db/policy.js';

const repository = createRepository((text, params) => query(text, params), runAsActor);

const QUERY_OPS = new Set(['select', 'insert', 'update', 'delete', 'upsert']);

function resolveActor(req) {
  const payload = req.user || {};
  return {
    userId: payload.sub,
    role: payload.role || 'karyawan',
  };
}

async function authenticate(req, reply) {
  try {
    if (!req.headers.authorization && req.cookies?.token) {
      req.headers.authorization = `Bearer ${req.cookies.token}`;
    }
    await req.jwtVerify();
    if (!req.user?.sub) {
      return reply.code(401).send({ error: 'Token tidak memuat identitas pengguna.' });
    }
    return null;
  } catch (_err) {
    return reply.code(401).send({ error: 'Sesi tidak valid atau telah kadaluarsa.' });
  }
}

function sendPolicyError(reply, err) {
  const status =
    err.code === 'UNAUTHENTICATED' ? 401 :
    err.code === 'BAD_REQUEST' ? 400 :
    403; // ROLE_DENIED, UNKNOWN_TABLE, UNKNOWN_COLUMN, UNKNOWN_OPERATOR, PK_REQUIRED, ...
  return reply.code(status).send({ error: err.message, code: err.code });
}

export default async function dataRoutes(fastify, _opts) {
  // POST /api/data/query
  fastify.post('/api/data/query', async (req, reply) => {
    const denied = await authenticate(req, reply);
    if (denied) return denied;

    const body = req.body || {};
    const { table, op } = body;

    if (typeof table !== 'string' || !table) {
      return reply.code(400).send({ error: 'Body harus memuat "table".', code: 'BAD_REQUEST' });
    }
    if (!QUERY_OPS.has(op)) {
      return reply.code(400).send({
        error: `Op tidak dikenal: ${String(op)}. Diizinkan: ${[...QUERY_OPS].join(', ')}`,
        code: 'UNKNOWN_OP',
      });
    }

    try {
      const result = await repository.execute(op, body, resolveActor(req));
      return reply.send(result);
    } catch (err) {
      if (err instanceof PolicyError) return sendPolicyError(reply, err);
      req.log.error(err);
      return reply.code(500).send({ error: 'Gagal memproses permintaan data.', code: 'INTERNAL' });
    }
  });

  // POST /api/data/rpc
  fastify.post('/api/data/rpc', async (req, reply) => {
    const denied = await authenticate(req, reply);
    if (denied) return denied;

    const body = req.body || {};
    const { fn, params } = body;

    if (typeof fn !== 'string' || !fn) {
      return reply.code(400).send({ error: 'Body harus memuat "fn".', code: 'BAD_REQUEST' });
    }
    if (!getRpcPolicy(fn)) {
      return reply.code(403).send({
        error: `RPC tidak dikenal atau tidak di-whitelist: ${fn}`,
        code: 'UNKNOWN_RPC',
      });
    }

    try {
      const result = await repository.execute('rpc', { fn, params: params || {} }, resolveActor(req));
      return reply.send(result);
    } catch (err) {
      if (err instanceof PolicyError) return sendPolicyError(reply, err);
      req.log.error(err);
      return reply.code(500).send({ error: 'Gagal mengeksekusi RPC.', code: 'INTERNAL' });
    }
  });

  // GET /api/data/rpc — expose the whitelist so the frontend can feature-detect.
  fastify.get('/api/data/rpc', async (req, reply) => {
    const denied = await authenticate(req, reply);
    if (denied) return denied;
    return reply.send({
      functions: Object.entries(RPC_POLICIES).map(([name, p]) => ({
        name,
        params: p.params,
        securityDefiner: p.securityDefiner,
      })),
    });
  });
}
