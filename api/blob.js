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

// [blob-5xx] diagnostics — boolean-only env presence, never log values.
function logBlobEnvPresence() {
  const presence = {
    BLOB_READ_WRITE_TOKEN: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    VERCEL_BLOB_BASE_URL: Boolean(process.env.VERCEL_BLOB_BASE_URL),
    VERCEL_BLOB_STORE_ID: Boolean(process.env.VERCEL_BLOB_STORE_ID),
  };
  console.error('[blob-5xx] env presence:', JSON.stringify(presence));
  const rawToken = process.env.BLOB_READ_WRITE_TOKEN || '';
  const m = /^vercel_blob_rw_([A-Za-z0-9]+)_/.exec(rawToken);
  const storeId = process.env.VERCEL_BLOB_STORE_ID || '';
  const tokenStoreId = m ? m[1] : '';
  const envStoreId = storeId.replace(/^store_/i, '').toLowerCase();
  const match = Boolean(tokenStoreId && envStoreId && tokenStoreId === envStoreId);
  console.error(`[blob-5xx] storeId token-vs-env match: ${match}`);
}

// Namespace yang diizinkan -> sumber kebenaran kepemilikan objek.
// Semua lookup memakai service role key (server-only) karena query
// melintasi baris milik user lain.
const PATHNAME_RULES = {
  'ktp-images': { table: 'transactions', column: 'ktp_image_url', ownerColumn: 'user_id' },
  'transfer-proofs': { table: 'transactions', column: 'transfer_proof_url', ownerColumn: 'user_id' },
  'deposit-refunds': { table: 'transactions', column: 'deposit_refund_proof_url', ownerColumn: 'user_id' },
  'tagihan-proofs': { table: 'tagihan_bulanan', column: 'proof_url', ownerColumn: 'user_id' },
  'fee-proofs': { table: 'tagihan_fee_lunas', column: 'proof_url', ownerColumn: 'user_id' },
  // user_profiles PK adalah `id` (= auth.users.id), bukan user_id.
  'avatars': { table: 'user_profiles', column: 'avatar_url', ownerColumn: 'id' },
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
  const ownerColumn = rule.ownerColumn || 'user_id';
  // Dual-format: nilai proxy di DB ditulis dalam DUA bentuk —
  //   literal: /api/blob?pathname=avatars/123.jpg
  //   encoded: /api/blob?pathname=avatars%2F123.jpg (hasil encodeURIComponent
  //   di api/upload.js dan disimpan apa adanya oleh AccountSettings).
  // Filter DB KOARSE dijalankan dua kali (literal, lalu encoded bila perlu).
  // Kecocokan PERSIS tetap di JS dengan normalisasi decode — pathname user
  // tidak pernah disisipkan ke pola LIKE (anti wildcard injection).
  const coarseQuery = (pattern) =>
    supabase
      .from(rule.table)
      .select(`${rule.column}, ${ownerColumn}`)
      .like(rule.column, pattern)
      .range(0, 999);

  // Escape LIKE wildcard (Postgres default escape char: backslash) agar
  // `_`/`%` pada filename tidak melebar pola. Pola kini mencakup folder +
  // filename persis (folder/filename tetap diprefix wildcard untuk menangkap
  // URL proxy maupun URL blob penuh legacy). Kecocokan otorisasi tetap
  // divalidasi PERSIS di JS di bawah — pola di sini hanya mempersempit
  // candidate set agar tidak melewati batas .range(0, 999) pada tabel besar
  // (transactions bisa >1000 baris per bulan; filter folder-saja melewatkan
  // baris target dan menghasilkan 404 no-ownership-row).
  const escapeLike = (s) => s.replace(/([%_\\])/g, '\\$1');
  const literalPattern = `%${parsed.folder}/${escapeLike(parsed.filename)}%`;
  const encodedPattern =
    `%${encodeURIComponent(parsed.folder)}%2F${escapeLike(encodeURIComponent(parsed.filename))}%`;

  let rows = [];
  const literal = await coarseQuery(literalPattern);
  if (literal.error) throw literal.error;
  rows = literal.data || [];

  if (rows.length === 0) {
    const encoded = await coarseQuery(encodedPattern);
    if (encoded.error) throw encoded.error;
    rows = encoded.data || [];
  }

  const decodeSafe = (v) => {
    try {
      return decodeURIComponent(v);
    } catch (_e) {
      return v;
    }
  };
  const hit = rows.find((r) => {
    if (typeof r[rule.column] !== 'string') return false;
    const raw = r[rule.column];
    // Match terhadap nilai mentah DAN bentuk decoded (dual-format).
    return raw.includes(parsed.pathname) || decodeSafe(raw).includes(parsed.pathname);
  });
  if (!hit) return null;
  return { ownerUserId: hit[ownerColumn] || null, table: rule.table };
}

export default async function handler(req, res) {
try {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }

  const { url: supabaseUrl, anonKey, serviceKey } = getSupabaseConfig();
  if (!supabaseUrl || !anonKey) {
    console.error('[blob-5xx] missing-env SUPABASE_URL (atau VITE_SUPABASE_URL) / SUPABASE_ANON_KEY (atau VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY / VITE_SUPABASE_ANON_KEY)');
    return res.status(500).json({ error: 'Konfigurasi Supabase belum lengkap.' });
  }
  if (!serviceKey) {
    console.error('[blob-5xx] missing-env SUPABASE_SERVICE_ROLE_KEY');
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
      console.warn(`[blob-404] pathname=${parsed.pathname} reason=no-ownership-row (folder=${parsed.folder}, tidak ada baris DB yang match)`);
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
        console.warn(`[blob-404] pathname=${parsed.pathname} reason=not-owner-non-admin (ownerUserId=${ownership.ownerUserId}, requester=${user.id}, role=${role})`);
        return res.status(404).json({ error: 'Objek tidak ditemukan.' });
      }
    }

    // ── 4) Ambil file dari Blob ─────────────────────────────────────
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
      const missing = [];
      if (!token2) missing.push('BLOB_READ_WRITE_TOKEN');
      if (!baseUrl) {
        if (!storeId && !normalizedEnvBaseUrl) missing.push('VERCEL_BLOB_STORE_ID (dan VERCEL_BLOB_BASE_URL tidak valid/kosong)');
        logBlobEnvPresence();
      }
      console.error(`[blob-5xx] missing-env ${missing.join(', ') || 'unknown-blob-config'}`);
      return res.status(500).json({ error: 'Konfigurasi Blob belum lengkap.' });
    }
    logBlobEnvPresence();

    const fileUrl = `${baseUrl.replace(/\/+$/, '')}/${parsed.pathname}`;
    const upstream = await fetch(fileUrl, {
      headers: {
        Authorization: `Bearer ${token2}`,
      },
    });

    if (!upstream.ok) {
      console.warn(`[blob-404] pathname=${parsed.pathname} reason=upstream-not-ok (upstreamStatus=${upstream.status}, baseUrl=${baseUrl})`);
      if (upstream.status !== 404) {
        console.error(`[blob-5xx] upstream-not-ok status=${upstream.status} pathname=${parsed.pathname}`);
      }
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
  } catch (err) {
  console.error('[blob-5xx] unhandled', err?.name, err?.message, err?.stack);
  if (!res.headersSent) {
    return res.status(500).json({ error: 'Terjadi kesalahan saat membaca file Blob.' });
  }
  return res.end();
  }
}
