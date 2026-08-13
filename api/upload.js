/* eslint-env node */
/* global process, Buffer */
import { put } from '@vercel/blob';
import { authenticateRequest } from './lib/auth.js';
import { sanitize, sanitizeFolder, validateUploadFile } from './lib/files.js';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB — sama dengan self-host storageRoutes

const readRequestBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }

  let user;
  try {
    user = await authenticateRequest(req, res);
  } catch (_e) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  if (!user) return; // 401/500 sudah dikirim

  try {
    const rawName = req.headers['x-file-name'] || `file-${Date.now()}`;
    const fileName = sanitize(rawName);
    const folder = sanitizeFolder(req.headers['x-folder'] || 'uploads');
    const body = await readRequestBody(req);

    if (!body || body.length === 0) {
      return res.status(400).json({ error: 'File kosong.' });
    }
    if (body.length > MAX_SIZE) {
      return res.status(400).json({ error: 'Ukuran file melebihi batas 10MB.' });
    }

    // Validasi: ekstensi whitelist + magic bytes; content type dari ekstensi,
    // bukan dari header klien (anti stored-XSS via text/html).
    const { ok, mime, error } = validateUploadFile({ fileName, buffer: body });
    if (!ok) {
      return res.status(400).json({ error });
    }

    const pathname = `${folder}/${fileName}`;
    const requestedAccess = (process.env.BLOB_OBJECT_ACCESS || '').toLowerCase();
    const access = requestedAccess === 'public' ? 'public' : 'private';
    const blob = await put(pathname, body, {
      access,
      addRandomSuffix: true,
      contentType: mime,
    });

    const proxyUrl = `/api/blob?pathname=${encodeURIComponent(blob.pathname)}`;
    return res.status(200).json({
      url: access === 'private' ? proxyUrl : blob.url,
      blobUrl: blob.url,
      proxyUrl,
      pathname: blob.pathname,
      access,
      uploadedBy: user.id,
    });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || 'Gagal upload file ke Vercel Blob.',
    });
  }
}
