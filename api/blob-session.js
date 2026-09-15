/* eslint-env node */
/* global process */
import { createClient } from '@supabase/supabase-js';

// ── Sprint 1 / C-2 pendukung: pertukaran JWT -> cookie sesi Blob ────────────
//
// <img src> tidak bisa mengirim header Authorization. Agar rendering gambar
// privat tetap bekerja TANPA menaruh JWT di URL (bocor ke log/referer),
// klien menukar access_token-nya dengan cookie HttpOnly berumur pendek:
//
//   POST /api/blob-session  { access_token }  -> Set-Cookie: kr_blob_session
//   DELETE /api/blob-session                -> hapus cookie
//
// Cookie SameSite=Lax + HttpOnly + Secure; /api/blob tetap memvalidasi
// token di SETIAP request (cookie kadaluarsa = 401, bukan akses lolos).

const ALLOWED_ORIGINS = [
  'https://admin.kakaramaroom.com',
  'https://kr-gamma.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
];

const BLOB_AUTH_COOKIE = 'kr_blob_session';
const COOKIE_MAX_AGE = 3300; // 55 menit — di bawah umur access token (1 jam)

const setCors = (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;
  return { url, anonKey };
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { url: supabaseUrl, anonKey } = getSupabaseConfig();
  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({ error: 'Konfigurasi Supabase belum lengkap.' });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', `${BLOB_AUTH_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }

  let body = {};
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch (_e) {
    return res.status(400).json({ error: 'Body JSON tidak valid.' });
  }

  // Token juga bisa dikirim via Authorization header (dipakai test/CLI).
  const authHeader = String(req.headers.authorization || '');
  const headerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  const token = String(body.access_token || headerToken || '');
  if (!token) {
    return res.status(401).json({ error: 'access_token diperlukan.' });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !userData?.user) {
    return res.status(401).json({ error: 'Token tidak valid atau kedaluwarsa.' });
  }

  res.setHeader(
    'Set-Cookie',
    `${BLOB_AUTH_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`
  );
  return res.status(200).json({ ok: true, expires_in: COOKIE_MAX_AGE });
}
