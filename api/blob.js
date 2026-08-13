/* eslint-env node */
/* global process, Buffer */
import { authenticateRequest } from './lib/auth.js';
import { isSafeInlineContentType } from './lib/files.js';

const ALLOWED_ORIGINS = [
  'https://admin.kakaramaroom.com',
  'https://kr-gamma.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
];

const setCors = (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }

  // Auth: Bearer header (fetch) atau ?token= (dipakai <img src>).
  let user;
  try {
    user = await authenticateRequest(req, res);
  } catch (_e) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  if (!user) return; // 401/500 sudah dikirim

  try {
    const pathname = String(req.query.pathname || '').replace(/^\/+/, '');
    if (!pathname) {
      return res.status(400).json({ error: 'Parameter pathname wajib diisi.' });
    }
    if (pathname.includes('..') || pathname.includes('\\')) {
      return res.status(400).json({ error: 'pathname tidak valid.' });
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const baseUrlFromEnvRaw = process.env.VERCEL_BLOB_BASE_URL;
    const storeId = process.env.VERCEL_BLOB_STORE_ID;
    const derivedBaseUrl = storeId
      ? `https://${storeId.replace(/^store_/i, '').toLowerCase()}.private.blob.vercel-storage.com`
      : '';
    const normalizedEnvBaseUrl = typeof baseUrlFromEnvRaw === 'string' ? baseUrlFromEnvRaw.trim().replace(/^["']|["']$/g, '') : '';
    const baseUrl = normalizedEnvBaseUrl.startsWith('http://') || normalizedEnvBaseUrl.startsWith('https://')
      ? normalizedEnvBaseUrl
      : derivedBaseUrl;

    if (!token || !baseUrl) {
      return res.status(500).json({ error: 'Konfigurasi Blob belum lengkap.' });
    }

    const fileUrl = `${baseUrl.replace(/\/+$/, '')}/${pathname}`;
    const upstream = await fetch(fileUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'Gagal mengambil file private Blob.' });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const data = Buffer.from(await upstream.arrayBuffer());
    const safe = isSafeInlineContentType(contentType);
    res.setHeader('Content-Type', safe ? contentType : 'application/octet-stream');
    res.setHeader('Content-Disposition', safe ? 'inline' : 'attachment');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).send(data);
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Terjadi kesalahan saat membaca file Blob.' });
  }
}
