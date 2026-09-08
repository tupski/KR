/* eslint-env node */
/* global process */
import { generateNotifications, parsePositiveInt } from '../services/notifications.js';

/**
 * Auth NOTIF_CRON_SECRET (bearer header atau ?secret=).
 * Mengembalikan true bila lolos; jika gagal, reply sudah dikirim.
 */
function authorizeCron(req, reply) {
  const requiredSecret = process.env.NOTIF_CRON_SECRET;
  const secret = String(req.query?.secret || '');
  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  const provided = bearer || secret;
  if (!requiredSecret) {
    reply.code(500).send({ error: 'Env NOTIF_CRON_SECRET belum diset.' });
    return false;
  }
  if (provided !== requiredSecret) {
    reply.code(401).send({ error: 'Unauthorized.' });
    return false;
  }
  return true;
}

async function handleGenerate(req, reply) {
  if (!authorizeCron(req, reply)) return reply;
  try {
    const windowMinutes = parsePositiveInt(req.query?.window_minutes, 5);
    const result = await generateNotifications({ windowMinutes });
    return reply.code(result.ok ? 200 : 207).send(result);
  } catch (e) {
    req.log?.error(e);
    return reply.code(500).send({ ok: false, error: e?.message || 'Gagal generate notifikasi.' });
  }
}

export default async function notificationsRoutes(fastify, _opts) {
  // GET|POST /api/notifications/generate (port dari api/generate-notifications.js)
  fastify.get('/api/notifications/generate', handleGenerate);
  fastify.post('/api/notifications/generate', handleGenerate);
}
