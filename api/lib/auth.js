/* eslint-env node */
/* global process */
import { createClient } from '@supabase/supabase-js';

let adminClient = null;

// Service-role client untuk verifikasi token + akses DB (admin).
export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  if (!adminClient) {
    adminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

// Token dari `Authorization: Bearer ...` atau `?token=` (dipakai <img src>).
export function extractToken(req) {
  const authHeader = String(req.headers?.authorization || '');
  if (authHeader.toLowerCase().startsWith('bearer ')) return authHeader.slice(7).trim();
  const q = req.query?.token;
  if (typeof q === 'string' && q.length > 0) return q;
  return null;
}

/**
 * Verifikasi Supabase access token. Bila gagal, response 401/500 sudah dikirim.
 * Return user object bila valid, null bila tidak.
 */
export async function authenticateRequest(req, res) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized.' });
    return null;
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    res.status(500).json({ error: 'Env SUPABASE_URL dan/atau SUPABASE_SERVICE_ROLE_KEY belum diset.' });
    return null;
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    res.status(401).json({ error: 'Unauthorized.' });
    return null;
  }
  return data.user;
}
