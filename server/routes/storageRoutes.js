// Storage routes: upload / proxy / delete / test. Mounted at /api/storage.
import { Router } from 'express';
import multer from 'multer';
import { getStorage } from '../storage/index.js';
import { sanitize, sanitizeFolder, decodeRef } from '../storage/util.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Provider + config non-secret dari env; secret dibaca impl dari process.env.
export function storageConfig(provider = process.env.STORAGE_PROVIDER || 'r2') {
  return {
    provider,
    bucket: process.env.R2_BUCKET || process.env.SUPABASE_STORAGE_BUCKET,
    endpoint: process.env.R2_ENDPOINT,
    region: process.env.R2_REGION,
    publicUrl: process.env.R2_PUBLIC_URL || process.env.VERCEL_BLOB_BASE_URL,
  };
}

router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const buffer = req.file?.buffer;
    if (!buffer || buffer.length === 0) return res.status(400).json({ error: 'File kosong.' });
    const fileName = sanitize(req.headers['x-file-name'] || req.file.originalname);
    const folder = sanitizeFolder(req.headers['x-folder'] || 'uploads');
    const adapter = getStorage(storageConfig());
    const { key, url } = await adapter.put({ buffer, fileName, folder });
    res.json({ url, key, provider: storageConfig().provider });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/proxy', requireAuth, async (req, res) => {
  try {
    const { provider, key } = decodeRef(req.query.ref);
    const adapter = getStorage(storageConfig(provider));
    const out = await adapter.get(key);
    res.set('Content-Type', out.contentType);
    res.set('Cache-Control', 'private, max-age=300');
    res.send(out.buffer ?? out.stream);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/delete', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ error: 'key required' });
    const adapter = getStorage(storageConfig());
    await adapter.del(key);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/test', requireAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const provider = req.query.provider || storageConfig().provider;
    const adapter = getStorage(storageConfig(provider));
    res.json(await adapter.ping());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
