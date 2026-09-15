/* eslint-env node */
/* global process, Buffer */
import { createClient } from '@supabase/supabase-js';

// ── Sprint 1 / C-2: proxy Blob privat kini WAJIB autentikasi + otorisasi ────
//
// Model akses:
//   anonymous                      -> 401
//   authenticated + bukan pemilik  -> 404 (resource tidak dikonfirmasi ada)
//   authenticated + pemilik        -> 200
//   admin / super_admin            -> 200 (semua namespace di allow-list)
//
// Otorisasi ditentukan SERVER dari pathname -> resource DB pemiliknya.
// pathname / query dari klien BUKAN bukti otorisasi.

const ALLOWED_ORIGINS = [
  'https://admin.kakaramaroom.com',
  'https://kr-gamma.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
];

const BLOB_AUTH_COOKIE = 'kr_blob_session';

// Namespace yang diizinkan -> sumber kebenaran kepemilikan objek.
// Semua lookup memakai service role key (server-only) karena query
// melintasi baris milik user lain.
const PATHNAME_RULES = {
  'ktp-images': { table: 'transactions', column: 'ktp_image_url' },
  'transfer-proofs': { table: 'transactions', column: 'transfer_proof_url' },
  'deposit-refunds': { table: 'transactions', column: 'deposit_refund_proof_url' },
  'tagihan-proofs': { table: 'tagihan_bulanan', column: 'proof_url' },
  'fee-proofs': { table: 'tagihan_fee_lunas', column: 'proof_url' },
  'avatars': { table: 'user_profiles', column: 'avatar_url' },
};

const setCors = (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// Path safety: tolak kosong, traversal, backslash, karakter di luar charset
// yang dihasilkan oleh sanitasi upload (A-Za-z0-9._-).
function parseSafePathname(raw) {
  let pathname;
  try {
    pathname = decodeURIComponent(String(raw || ''));
  } catch (_e) {
    return null;
  }
  if (!pathname) return null;
  if (pathname.includes('..') || pathname.includes('\\') || pathname.includes('%')) return null;
  if (pathname.startsWith('/')) pathname = pathname.replace(/^\/+/, '');
  const match = /^([a-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(pathname);
  if (!match) return null;
  const [, folder, filename] = match;
  if (!PATHNAME_RULES[folder]) return null;
  if (filename.startsWith('.')) return null;
  return { folder, filename, pathname };
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, anonKey, serviceKey };
}

// Ekstrak JWT: Authorization: Bearer <token> ATAU cookie kr_blob_session
// (cookie HttpOnly dipasang oleh /api/blob-session agar <img src> same-origin
// tetap bekerja tanpa membocorkan token ke URL).
function extractToken(req) {
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = String(req.headers.cookie || '');
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === BLOB_AUTH_COOKIE) return rest.join('=').trim();
  }
  return '';
}

// Cari resource pemilik objek untuk sebuah pathname.
// Nilai URL di DB bisa berupa proxy path (/api/blob?pathname=...) atau URL
// blob penuh dari data lama. Filter DB sengaja KOARSE (prefix folder saja)
// lalu kecocokan PERSIS dilakukan di sisi server — menghindari LIKE
// wildcard injection: karakter '_' pada filename user adalah wildcard
// Postgres, jadi jangan pernah menyisipkan pathname user ke pola LIKE.
async function findObjectOwnership(supabase, parsed) {
  const rule = PATHNAME_RULES[parsed.folder];
  const coarsePattern = `%/${parsed.folder}/%`;
  const { data, error } = await supabase
    .from(rule.table)
    .select(`${rule.column}, user_id`)
    .like(rule.column, coarsePattern)
    .range(0, 999);
  if (error) throw error;
  const rows = data || [];
  const hit = rows.find(
    (r) => typeof r[rule.column] === 'string' && r[rule.column].includes(parsed.pathname)
  );
  if (!hit) return null;
  return { ownerUserId: hit.user_id || null, table: rule.table };
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }

  const { url: supabaseUrl, anonKey, serviceKey } = getSupabaseConfig();
  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({ error: 'Konfigurasi Supabase belum lengkap.' });
  }
  if (!serviceKey) {
    return res.status(500).json({ error: 'Konfigurasi SUPABASE_SERVICE_ROLE_KEY belum lengkap.' });
  }

  // ── 1) Autentikasi: JWT via header atau cookie sesi ──────────────────────
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Autentikasi diperlukan.' });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await authClient.auth.getUser(token);
  const user = userData?.user;
  if (authError || !user) {
    return res.status(401).json({ error: 'Sesi tidak valid atau kedaluwarsa.' });
  }

  // ── 2) Path safety ────────────────────────────────────────────────────────
  const parsed = parseSafePathname(req.query.pathname);
  if (!parsed) {
    return res.status(400).json({ error: 'Pathname tidak valid.' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // ── 3) Otorisasi: pemilik ATAU admin/super_admin ───────────────────────
    const ownership = await findObjectOwnership(supabase, parsed);
    if (!ownership) {
      // 404 juga untuk "bukan milikmu" — jangan konfirmasi keberadaan objek.
      return res.status(404).json({ error: 'Objek tidak ditemukan.' });
    }

    let role = 'karyawan';
    if (ownership.ownerUserId !== user.id) {
      const { data: roleRow, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      if (roleError) throw roleError;
      role = roleRow?.role || 'karyawan';
      if (!['admin', 'super_admin'].includes(role)) {
        return res.status(404).json({ error: 'Objek tidak ditemukan.' });
      }
    }

    // ── 4) Ambil file dari Blob privat ─────────────────────────────────────
    const token2 = process.env.BLOB_READ_WRITE_TOKEN;
    const baseUrlFromEnvRaw = process.env.VERCEL_BLOB_BASE_URL;
    const storeId = process.env.VERCEL_BLOB_STORE_ID;
    const derivedBaseUrl = storeId
      ? `https://${storeId.replace(/^store_/i, '').toLowerCase()}.private.blob.vercel-storage.com`
      : '';
    const normalizedEnvBaseUrl = typeof baseUrlFromEnvRaw === 'string' ? baseUrlFromEnvRaw.trim().replace(/^["']|["']$/g, '') : '';
    const baseUrl = normalizedEnvBaseUrl.startsWith('http://') || normalizedEnvBaseUrl.startsWith('https://')
      ? normalizedEnvBaseUrl
      : derivedBaseUrl;

    if (!token2 || !baseUrl) {
      return res.status(500).json({ error: 'Konfigurasi Blob belum lengkap.' });
    }

    const fileUrl = `${baseUrl.replace(/\/+$/, '')}/${parsed.pathname}`;
    const upstream = await fetch(fileUrl, {
      headers: {
        Authorization: `Bearer ${token2}`,
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status === 404 ? 404 : 502).json({ error: 'Gagal mengambil file privat.' });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const data = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    // Caching: objek privat TIDAK boleh di-cache publik.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(data);
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Terjadi kesalahan saat membaca file Blob.' });
  }
}
