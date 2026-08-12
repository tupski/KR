// Storage routes: upload / proxy / delete / test. Mounted at /api/storage.
import { Router } from 'express';
import multer from 'multer';
import { getStorage } from '../storage/index.js';
import {
  sanitize, sanitizeFolder, decodeRef, isAllowedExtension, magicType, isSafeInlineContentType,
} from '../storage/util.js';
import { requireAuth, requireRole } from '../auth.js';
import { sendError } from '../errors.js';
import { resolveStorageConfig } from '../settings.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const EXT_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', pdf: 'application/pdf',
};
const MAGIC_OK = (mime, buf) => {
  const m = magicType(buf);
  return !m || m === mime; // tolak bila magic terdeteksi dan mismatch; izinkan bila tidak dikenal
};

// Upload guard: ekstensi whitelist + magic bytes minimal (T1).
function validateFile({ fileName, buffer }) {
  if (!isAllowedExtension(fileName)) {
    const err = new Error('Tipe file tidak diizinkan');
    err.status = 400; err.isValidation = true;
    throw err;
  }
  const ext = fileName.split('.').pop().toLowerCase();
  const mime = EXT_MIME[ext];
  if (!mime) {
    const err = new Error('Tipe file tidak diizinkan');
    err.status = 400; err.isValidation = true;
    throw err;
  }
  if (!MAGIC_OK(mime, buffer)) {
    const err = new Error('Isi file tidak cocok dengan ekstensinya');
    err.status = 400; err.isValidation = true;
    throw err;
  }
  return mime;
}

export default function storageRoutes({ cfg } = {}) {
  const router = Router();
  const storageConfig = () => resolveStorageConfig(cfg, process.env);

  router.post('/upload', requireAuth(cfg?.jwtSecret, cfg?.pool), upload.single('file'), async (req, res) => {
    try {
      const buffer = req.file?.buffer;
      if (!buffer || buffer.length === 0) return res.status(400).json({ error: 'File kosong.' });
      const fileName = sanitize(req.headers['x-file-name'] || req.file.originalname);
      const folder = sanitizeFolder(req.headers['x-folder'] || 'uploads');
      validateFile({ fileName, buffer });
      const adapter = getStorage(storageConfig());
      const { key, url } = await adapter.put({ buffer, fileName, folder });
      res.json({ url, key, provider: storageConfig().provider });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/proxy', requireAuth(cfg?.jwtSecret, cfg?.pool), async (req, res) => {
    try {
      const { provider, key } = decodeRef(req.query.ref);
      const adapter = getStorage(storageConfig(provider));
      const out = await adapter.get(key);
      const ct = out.contentType || 'application/octet-stream';
      res.set('Content-Type', ct);
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
      res.set('Cache-Control', 'private, max-age=300');
      if (isSafeInlineContentType(ct)) {
        res.set('Content-Disposition', 'inline');
      } else {
        res.set('Content-Disposition', 'attachment');
      }
      res.send(out.buffer ?? out.stream);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/delete', requireAuth(cfg?.jwtSecret, cfg?.pool), requireRole('admin', 'super_admin'), async (req, res) => {
    try {
      const { key } = req.body || {};
      if (!key) return res.status(400).json({ error: 'key required' });
      const adapter = getStorage(storageConfig());
      await adapter.del(key);
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/test', requireAuth(cfg?.jwtSecret, cfg?.pool), requireRole('super_admin'), async (req, res) => {
    try {
      const provider = req.query.provider || storageConfig().provider;
      const adapter = getStorage(storageConfig(provider));
      res.json(await adapter.ping());
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
