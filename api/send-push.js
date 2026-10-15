/* eslint-env node */
/* global process */
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// web-push is CommonJS; require() is the safest in Vite/Vercel ESM.
const webpush = require('web-push');

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function configWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@kakaramaroom.com';
  if (!publicKey || !privateKey) return null;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { publicKey, subject };
}

async function fetchUserIdsByRole(supabase, role) {
  const { data, error } = await supabase.from('user_roles').select('user_id').eq('role', role);
  if (error) throw error;
  return (data || []).map((x) => x.user_id).filter(Boolean);
}

async function fetchSubscriptions(supabase, userIds) {
  if (!userIds.length) return [];
  const { data, error } = await supabase.from('push_subscriptions').select('user_id, endpoint, p256dh, auth').in('user_id', userIds);
  if (error) throw error;
  return data || [];
}

export async function sendPushToAudience({ title, body, url = '/', icon = '/kr-icon-192.svg', audience_role, audience_user_id }) {
  if (process.env.NOTIFICATIONS_ENABLED === 'false') {
    return { attempted: 0, sent: 0, failed: 0, failures: [], disabled: true };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Supabase admin env belum lengkap.');
  if (!configWebPush()) throw new Error('VAPID env belum lengkap.');

  let userIds = [];
  if (audience_user_id) userIds = [audience_user_id];
  else if (audience_role === 'all') {
    const { data, error } = await supabase.from('user_roles').select('user_id');
    if (error) throw error;
    userIds = [...new Set((data || []).map((x) => x.user_id).filter(Boolean))];
  } else if (audience_role) {
    userIds = await fetchUserIdsByRole(supabase, audience_role);
  }

  const subs = await fetchSubscriptions(supabase, userIds);
  const payload = JSON.stringify({ title, body, url, icon, badge: '/kr-icon-192.svg' });

  const results = { attempted: subs.length, sent: 0, failed: 0, failures: [] };
  for (const s of subs) {
    const subscription = {
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth },
    };
    try {
      await webpush.sendNotification(subscription, payload);
      results.sent += 1;
    } catch (e) {
      results.failed += 1;
      results.failures.push({ user_id: s.user_id, endpoint: s.endpoint, message: e?.message || 'Push failed' });
    }
  }
  return results;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak diizinkan.' });

  const requiredSecret = process.env.NOTIF_CRON_SECRET;
  const secret = String(req.query?.secret || '');
  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  const provided = bearer || secret;
  if (!requiredSecret) return res.status(500).json({ error: 'Env NOTIF_CRON_SECRET belum diset.' });
  if (provided !== requiredSecret) return res.status(401).json({ error: 'Unauthorized.' });

  try {
    const { title, body, url, icon, audience_role, audience_user_id } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title wajib.' });
    const out = await sendPushToAudience({ title, body, url, icon, audience_role, audience_user_id });
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Gagal kirim push.' });
  }
}

