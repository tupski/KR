/**
 * @file storage.controller.js
 * @description HTTP handlers for the storage module.
 *
 * Routes handled here:
 *   POST   /api/storage/upload        — upload a file (multipart OR raw body)
 *   GET    /api/storage/file/:pathname — stream a stored file to the client
 *   DELETE /api/storage/file/:pathname — delete a stored file (admin only)
 */

import * as storageService from './storage.service.js';
import { ValidationError } from '../../middleware/errorHandler.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = parseInt(process.env.STORAGE_MAX_FILE_SIZE || String(10 * 1024 * 1024), 10); // 10 MB

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Sanitise a raw folder string — alphanumeric, hyphens, and underscores only.
 *
 * @param {string} raw
 * @returns {string}
 */
function sanitiseFolder(raw) {
  return (raw || 'uploads').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

/**
 * Collect a raw-body request into a single Buffer.
 *
 * @param {import('express').Request} req
 * @returns {Promise<Buffer>}
 */
function collectRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_FILE_SIZE) {
        req.destroy();
        reject(new ValidationError(`File exceeds maximum size of ${MAX_FILE_SIZE} bytes`));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end',   () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * POST /api/storage/upload
 *
 * Supports two upload modes:
 *   1. multipart/form-data  — file field named "file", optional "folder" field
 *   2. raw body             — headers: x-file-name, x-folder, content-type
 *
 * Response: { url, pathname, access }
 *
 * @type {import('express').RequestHandler}
 */
export async function uploadHandler(req, res, next) {
  try {
    let buffer;
    let filename;
    let folder;
    let contentType;

    const isMultipart = req.is('multipart/form-data');

    if (isMultipart) {
      // multer has already parsed the file into req.file
      if (!req.file) {
        throw new ValidationError('No file provided in multipart request (field name: "file")');
      }

      buffer      = req.file.buffer;
      filename    = req.file.originalname || 'upload';
      folder      = sanitiseFolder(req.body?.folder || 'uploads');
      contentType = req.file.mimetype;
    } else {
      // Raw body mode — compatible with legacy Vercel Blob upload
      filename    = req.headers['x-file-name'] || 'upload';
      folder      = sanitiseFolder(req.headers['x-folder'] || 'uploads');
      contentType = req.headers['content-type'] || 'application/octet-stream';
      buffer      = await collectRawBody(req);
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(contentType)) {
      throw new ValidationError(
        `Unsupported file type: ${contentType}. Allowed: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
      );
    }

    // Validate size (applies to both modes; raw body is checked during collection)
    if (buffer.length > MAX_FILE_SIZE) {
      throw new ValidationError(`File exceeds maximum size of ${MAX_FILE_SIZE} bytes`);
    }

    const result = await storageService.uploadFile(buffer, folder, filename, contentType);

    return res.status(201).json({
      url:      result.url,
      pathname: result.pathname,
      access:   result.access,
      // Legacy field aliases (compatibility with Vercel Blob consumers)
      blobUrl:  result.url,
      proxyUrl: result.url,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/storage/file/*
 *
 * Streams the stored file to the response.
 * Pathname is read from `req.params[0]` (Express wildcard capture).
 *
 * @type {import('express').RequestHandler}
 */
export async function getFileHandler(req, res, next) {
  try {
    // Express wildcard param — works with router.get('/file/*', ...)
    const pathname = req.params[0] || '';
    if (!pathname) {
      throw new ValidationError('Missing file pathname');
    }

    const { stream, contentType } = await storageService.getFile(pathname);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=300');

    stream.pipe(res);
    stream.on('error', next);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/storage/file/*
 *
 * Deletes a stored file. Requires admin or super_admin role.
 *
 * @type {import('express').RequestHandler}
 */
export async function deleteFileHandler(req, res, next) {
  try {
    const pathname = req.params[0] || '';
    if (!pathname) {
      throw new ValidationError('Missing file pathname');
    }

    await storageService.deleteFile(pathname);

    return res.json({ message: 'File deleted' });
  } catch (err) {
    next(err);
  }
}
