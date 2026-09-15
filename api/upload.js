/* eslint-env node */
/* global process, Buffer */
import { put } from '@vercel/blob';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

// ── Konfigurasi keamanan upload (Sprint 1 / H-1) ────────────────────────────
// Folder yang diizinkan + siapa yang boleh mengunggah ke folder itu.
// 'any'        = semua user ter-autentikasi (karyawan perlu upload KTP/bukti)
// 'privileged' = hanya admin / super_admin (bukti tagihan & fee)
const ALLOWED_FOLDERS = {
  'ktp-images': 'any',
  'transfer-proofs': 'any',
  'avatars': 'any',
  'tagihan-proofs': 'privileged',
  'fee-proofs': 'privileged',
};

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB — KTP/bukti hasil kompresi jauh di bawah ini

// MIME allow-list + validasi magic bytes (signature), bukan percaya header klien.
const MIME_RULES = {
  'image/jpeg': { check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/webp': { check: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  'image/heic': { check: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' },
  'image/heif': { check: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' },
};

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;
  return { url, anonKey };
}

const readRequestBody = async (req) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) {
      return { tooLarge: true };
    }
    chunks.push(chunk);
  }
  return { body: Buffer.concat(chunks) };
};

// Sanitisasi filename DI SERVER — jangan pernah percaya input klien.
function sanitizeFileName(rawName, contentType) {
  const base = String(rawName || '').split(/[\\/]/).pop(); // buang path/traversal
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');
  let ext = '';
  const dot = clean.lastIndexOf('.');
  if (dot > 0) {
    const candidate = clean.slice(dot + 1).toLowerCase();
    if (/^[a-z0-9]{1,5}$/.test(candidate)) ext = candidate;
  }
  if (!ext && EXT_BY_MIME[contentType]) ext = EXT_BY_MIME[contentType];
  return `${Date.now()}-${randomBytes(6).toString('hex')}${ext ? `.${ext}` : '.bin'}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }

  const { url: supabaseUrl, anonKey } = getSupabaseConfig();
  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({ error: 'Konfigurasi Supabase (SUPABASE_URL / anon key) belum lengkap.' });
  }

  // ── 1) Autentikasi: wajib JWT Supabase yang valid ────────────────────────
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
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

  // ── 2) Otorisasi per kategori folder (allow-list server-side) ───────────
  const folder = String(req.headers['x-folder'] || '').replace(/^\/+|\/+$/g, '');
  const folderRule = ALLOWED_FOLDERS[folder];
  if (!folderRule) {
    return res.status(400).json({ error: 'Folder upload tidak diizinkan.' });
  }

  if (folderRule === 'privileged') {
    const authedClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: roleRow } = await authedClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();
    const role = roleRow?.role || 'karyawan';
    if (!['admin', 'super_admin'].includes(role)) {
      return res.status(403).json({ error: 'Akses ditolak untuk kategori upload ini.' });
    }
  }

  // ── 3) Validasi ukuran ────────────────────────────────────────────────────
  const read = await readRequestBody(req);
  if (read.toLarge || read.tooLarge) {
    return res.status(413).json({ error: 'File terlalu besar (maksimal 5 MB).' });
  }
  const body = read.body;
  if (!body || body.length === 0) {
    return res.status(400).json({ error: 'File kosong.' });
  }
  if (body.length > MAX_UPLOAD_BYTES) {
    return res.status(413).json({ error: 'File terlalu besar (maksimal 5 MB).' });
  }

  // ── 4) Validasi tipe file: MIME allow-list + magic bytes ─────────────────
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const rule = MIME_RULES[contentType];
  if (!rule) {
    return res.status(415).json({ error: 'Tipe file tidak didukung. Gunakan JPG, PNG, WEBP, HEIC, atau HEIF.' });
  }
  if (!rule.check(body)) {
    return res.status(415).json({ error: 'Isi file tidak sesuai dengan tipe yang diklaim.' });
  }

  // ── 5) Filename disaniter di server ──────────────────────────────────────
  const rawName = req.headers['x-file-name'] || '';
  const safeName = sanitizeFileName(rawName, contentType);
  const pathname = `${folder}/${safeName}`;

  const requestedAccess = (process.env.BLOB_OBJECT_ACCESS || '').toLowerCase();
  const access = requestedAccess === 'public' ? 'public' : 'private';

  try {
    const blob = await put(pathname, body, {
      access,
      addRandomSuffix: true,
      contentType,
    });

    const proxyUrl = `/api/blob?pathname=${encodeURIComponent(blob.pathname)}`;
    return res.status(200).json({
      url: access === 'private' ? proxyUrl : blob.url,
      blobUrl: blob.url,
      proxyUrl,
      pathname: blob.pathname,
      access,
    });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || 'Gagal upload file ke Vercel Blob.',
    });
  }
}
