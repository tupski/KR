/* eslint-env node */
/* global process */
import { sendPushToAudience } from '../services/push.js';

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

export default async function pushRoutes(fastify, _opts) {
  // POST /api/push/send (port dari api/send-push.js, Vercel: POST /api/send-push)
  fastify.post('/api/push/send', async (req, reply) => {
    if (!authorizeCron(req, reply)) return reply;
    try {
      const { title, body, url, icon, audience_role, audience_user_id } = req.body || {};
      if (!title) return reply.code(400).send({ error: 'title wajib.' });
      const out = await sendPushToAudience({ title, body, url, icon, audience_role, audience_user_id });
      return reply.code(200).send({ ok: true, ...out });
    } catch (e) {
      req.log?.error(e);
      return reply.code(500).send({ ok: false, error: e?.message || 'Gagal kirim push.' });
    }
  });
}
