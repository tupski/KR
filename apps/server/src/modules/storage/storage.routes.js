/**
 * @file storage.routes.js
 * @description Express router for the storage module.
 *
 * Mounted at /api/storage in app.js.
 *
 * Routes:
 *   POST   /upload        — upload a file (auth required)
 *   GET    /file/*        — retrieve a file (auth required)
 *   DELETE /file/*        — delete a file (auth + admin/super_admin required)
 */

import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../../middleware/auth.middleware.js';
import {
  uploadHandler,
  getFileHandler,
  deleteFileHandler,
} from './storage.controller.js';

const router = Router();

// ── Multer config ─────────────────────────────────────────────────────────────
// Use memory storage so the buffer is available as req.file.buffer
const MAX_SIZE = parseInt(process.env.STORAGE_MAX_FILE_SIZE || String(10 * 1024 * 1024), 10);

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_SIZE },
  fileFilter(_req, file, cb) {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
    if (allowed.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/storage/upload
 *
 * Accepts either:
 *   - multipart/form-data with a field named "file" (+ optional "folder")
 *   - raw body with headers: x-file-name, x-folder, content-type
 */
router.post(
  '/upload',
  requireAuth,
  // Apply multer only for multipart requests; raw-body requests bypass it gracefully
  (req, res, next) => {
    if (req.is('multipart/form-data')) {
      return upload.single('file')(req, res, next);
    }
    next();
  },
  uploadHandler,
);

/**
 * GET /api/storage/file/*
 *
 * Streams the stored file to the authenticated client.
 * The wildcard (*) captures the full relative pathname, e.g.:
 *   GET /api/storage/file/ktp-images/photo-123.jpg
 */
router.get('/file/*', requireAuth, getFileHandler);

/**
 * DELETE /api/storage/file/*
 *
 * Permanently deletes a stored file.
 * Requires admin or super_admin role.
 */
router.delete(
  '/file/*',
  requireAuth,
  requireRole('admin', 'super_admin'),
  deleteFileHandler,
);

export default router;
