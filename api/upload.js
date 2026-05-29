/* eslint-env node */
/* global process, Buffer */
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

// ─── FILE VALIDATION ───────────────────────────────────────────────────────
const MAX_UPLOAD_SIZE_MB = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '10', 10);
const MAX_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

// ─── CORS ALLOWLIST ────────────────────────────────────────────────────────
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3001',
  'https://admin.kakaramaroom.com',
  'https://kr-gamma.vercel.app',
];

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// ─── RATE LIMITING ─────────────────────────────────────────────────────────
const RATE_LIMIT_REQUESTS = parseInt(process.env.RATE_LIMIT_REQUESTS || '10', 10);
const RATE_LIMIT_WINDOW_MINUTES = parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || '15', 10);
const RATE_LIMIT_WINDOW_MS = RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;

// Simple in-memory rate limiter (IP-based)
// For production, use Redis or similar
const rateLimitStore = new Map();

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip;

  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, []);
  }

  const requests = rateLimitStore.get(key);
  // Remove old requests outside the window
  const validRequests = requests.filter(time => now - time < RATE_LIMIT_WINDOW_MS);

  if (validRequests.length >= RATE_LIMIT_REQUESTS) {
    return false; // Rate limit exceeded
  }

  validRequests.push(now);
  rateLimitStore.set(key, validRequests);
  return true; // Request allowed
}

// Cleanup old entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, requests] of rateLimitStore.entries()) {
    const validRequests = requests.filter(time => now - time < RATE_LIMIT_WINDOW_MS);
    if (validRequests.length === 0) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, validRequests);
    }
  }
}, 5 * 60 * 1000);

/**
 * Extract Bearer token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} - Token or null if invalid
 */
function extractBearerToken(authHeader) {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

/**
 * Verify Supabase JWT token
 * @param {string} token - JWT token to verify
 * @returns {Promise<object>} - User object if valid
 * @throws {Error} - If token is invalid or expired
 */
async function verifySupabaseToken(token) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase credentials not configured');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new Error(error?.message || 'Invalid or expired token');
  }

  return data.user;
}

/**
 * Check if request has valid authentication
 * @param {object} req - Node request object
 * @returns {Promise<object>} - { valid: boolean, user: object|null, error: string|null }
 */
async function checkAuth(req) {
  const authHeader = req.headers.authorization;
  const token = extractBearerToken(authHeader);

  if (!token) {
    console.warn('[upload] No authorization token provided in request');
    return {
      valid: false,
      user: null,
      error: 'Unauthorized',
    };
  }

  try {
    const user = await verifySupabaseToken(token);
    return {
      valid: true,
      user,
      error: null,
    };
  } catch (error) {
    console.error('[upload] Token verification failed:', error?.message);
    return {
      valid: false,
      user: null,
      error: error?.message || 'Invalid token',
    };
  }
}

function getS3Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;
  const region = process.env.R2_REGION || 'auto';

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials not configured');
  }

  return new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

export default async function handler(req, res) {
  // ─── CORS ALLOWLIST ────────────────────────────────────────────────────────
  const origin = req.headers.origin || req.headers.referer;
  const isOriginAllowed = ALLOWED_ORIGINS.some(
    allowed => origin && origin.startsWith(allowed)
  );

  if (isOriginAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-file-name, x-folder');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // ─── CORS REJECTION ────────────────────────────────────────────────────────
  if (!isOriginAllowed && origin) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  // ─── RATE LIMITING ─────────────────────────────────────────────────────────
  const clientIp = getClientIp(req);
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      error: `Rate limit exceeded. Max ${RATE_LIMIT_REQUESTS} requests per ${RATE_LIMIT_WINDOW_MINUTES} minutes.`,
    });
  }

  // ─── AUTH CHECK ────────────────────────────────────────────────────────────
  const auth = await checkAuth(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }

  // ─── DELETE ────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    try {
      const { key } = req.body;
      if (!key) {
        return res.status(400).json({ error: 'Key file wajib diisi.' });
      }

      const s3 = getS3Client();
      const bucket = process.env.R2_BUCKET || 'artupski-drive';

      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[upload] DELETE error:', error);
      return res.status(500).json({
        error: error?.message || 'Gagal menghapus file.',
      });
    }
  }

  // ─── POST ──────────────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }

  try {
    const rawName = req.headers['x-file-name'] || `file-${Date.now()}`;
    const folder = (req.headers['x-folder'] || 'uploads').toString().replace(/[^a-zA-Z0-9/_-]/g, '');
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    // ─── FILE TYPE VALIDATION ──────────────────────────────────────────────────
    if (!ALLOWED_TYPES.includes(contentType)) {
      return res.status(400).json({
        error: `Tipe file tidak diizinkan: ${contentType}. Allowed: ${ALLOWED_TYPES.join(', ')}`,
      });
    }

    // ─── FILE EXTENSION VALIDATION ─────────────────────────────────────────────
    const fileExtension = rawName.substring(rawName.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
      return res.status(400).json({
        error: `Ekstensi file tidak diizinkan: ${fileExtension}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
      });
    }

    const bodyRaw = req.body;

    if (!bodyRaw || bodyRaw.length === 0) {
      return res.status(400).json({ error: 'File kosong.' });
    }

    if (bodyRaw.length > MAX_SIZE) {
      return res.status(400).json({
        error: `Ukuran file maksimal ${MAX_UPLOAD_SIZE_MB}MB.`,
      });
    }

    // ─── SENSITIVE FILE WARNING ────────────────────────────────────────────────
    // TODO: ktp-images dan proof-images harus menggunakan protected endpoint/signed URL
    // di production. Saat ini disimpan di public R2 bucket.
    // Implementasi: Buat endpoint terpisah untuk generate signed URL dengan TTL.
    // Jangan expose R2 secret ke frontend.

    const s3 = getS3Client();
    const bucket = process.env.R2_BUCKET || 'artupski-drive';
    const key = `${folder}/${rawName}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bodyRaw,
        ContentType: contentType,
      })
    );

    const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL || `https://cdn.artupski.com`;
    const url = `${publicBaseUrl.replace(/\/+$/, '')}/${key}`;

    return res.status(200).json({ url, key });
  } catch (error) {
    console.error('[upload] Error:', error);
    return res.status(500).json({
      error: error?.message || 'Gagal upload file ke R2.',
    });
  }
}
