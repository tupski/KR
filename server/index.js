/* eslint-env node */
/* global process, Buffer */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyJwt from '@fastify/jwt';
// eslint-disable-next-line import/default
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import { loadConfig, redactConfigForLog } from './config.js';
import { authenticate, originGuard, requireAdmin, requireRole } from './middleware/auth.js';
import {
  buildStorageDriver, sanitizeStorageKey, safeFileName, classifyStorageReference,
} from './storage/index.js';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import { checkDbHealth, closePool } from './db/index.js';

dotenv.config();

const config = loadConfig(process.env);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_PATH = path.resolve(config.localStoragePath);
const DIST_PATH = path.resolve(__dirname, '..', config.distPath);

export async function buildServer(cfg = config) {
  const fastify = Fastify({
    trustProxy: true, // behind aaPanel Nginx reverse proxy
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      redact: {
        paths: [
          'req.headers.authorization', 'req.headers.cookie',
          '*.password', '*.passwordHash', '*.token', '*.secret',
        ],
        censor: '[REDACTED]',
      },
      serializers: {
        req(req) {
          return { method: req.method, url: req.url, host: req.headers?.host };
        },
      },
    },
  });

  // ── CORS: strict allowlist (never '*' with credentials) ──
  await fastify.register(fastifyCors, {
    origin: (origin, cb) => {
      const allowed = new Set(cfg.corsOrigins.map((o) => o.replace(/\/+$/, '')));
      if (!origin) return cb(null, true); // same-origin / curl / health checks
      const candidate = String(origin).replace(/\/+$/, '');
      if (allowed.has(candidate)) return cb(null, true);
      return cb(new Error('Origin tidak diizinkan'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ── Rate limiting (brute-force protection on auth + global floor) ──
  await fastify.register(fastifyRateLimit, {
    global: true,
    max: cfg.rateLimit.max,
    timeWindow: cfg.rateLimit.window,
    allowList: ['127.0.0.1'],
  });

  await fastify.register(fastifyCookie);
  await fastify.register(fastifyJwt, {
    secret: cfg.jwtSecret,
    sign: { expiresIn: cfg.jwtExpiresIn },
    cookie: { cookieName: 'token', signed: false },
    formatUser: (payload) => ({ sub: payload.sub, email: payload.email }),
  });

  await fastify.register(fastifyMultipart, {
    limits: { fileSize: cfg.maxUploadBytes, files: 1 },
    attachFieldsToBody: false,
  });

  // Raw binary uploads (legacy /api/upload contract posts the file as the
  // request body with an image/* content-type). Without this parser Fastify
  // would reject those requests with 415 before the handler runs.
  fastify.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: cfg.maxUploadBytes }, (_req, body, done) => {
    done(null, body);
  });

  fastify.decorate('appConfig', cfg);
  fastify.decorate('authenticate', authenticate);

  // Bind the storage driver to THIS server's config (not process.env) so tests
  // and multiple instances are isolated. Routes use fastify.storageDriver.
  const storageDriver = buildStorageDriver(cfg);
  fastify.decorate('storageDriver', storageDriver);

  // Stricter limit for login endpoints (registered before routes so it applies).
  await fastify.register(async (scope) => {
    scope.addHook('onRequest', fastify.rateLimit({
      max: cfg.rateLimit.authMax,
      timeWindow: cfg.rateLimit.authWindow,
      keyGenerator: (req) => req.ip,
    }));
    await scope.register(authRoutes);
  }, { prefix: '/api/auth' });

  await fastify.register(apiRoutes);

  // Optional sibling route modules added by later phases; register if present.
  for (const [modPath, register] of [
    ['./routes/data.js', 'dataRoutes'],
    ['./routes/push.js', 'pushRoutes'],
    ['./routes/notifications.js', 'notificationsRoutes'],
  ]) {
    const abs = path.join(__dirname, modPath);
    if (fs.existsSync(abs)) {
      const mod = await import(modPath);
      await fastify.register(mod.default);
    }
  }

  // ── Private media proxy: /api/blob (legacy contract preserved) ──
  // Objects are NOT publicly listed; access requires an authenticated session
  // because legacy Vercel Blob objects here were PRIVATE (KTP, bukti transfer).
  fastify.get('/api/blob', {
    config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
    preHandler: [authenticate],
  }, async (req, reply) => {
    const rawPathname = String(req.query.pathname || '');
    if (!rawPathname) {
      return reply.code(400).send({ error: 'Parameter pathname wajib diisi.' });
    }
    const { canonicalKey } = classifyStorageReference(rawPathname);
    if (!canonicalKey) {
      return reply.code(400).send({ error: 'Referensi berkas tidak valid.' });
    }

    const driver = storageDriver;
    try {
      const data = await driver.get(canonicalKey);
      if (!data) {
        return reply.code(404).send({ error: 'File tidak ditemukan di storage.' });
      }
      reply.header('Cache-Control', 'private, max-age=300');
      reply.header('X-Content-Type-Options', 'nosniff');
      return reply.send(data);
    } catch (err) {
      req.log.error({ err: err.message, key: canonicalKey }, 'blob read failed');
      return reply.code(500).send({ error: 'Gagal mengambil file storage.' });
    }
  });

  // ── Upload (contract-compatible with legacy /api/upload) ──
  fastify.post('/api/upload', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    preHandler: cfg.uploadRequireAuth
      ? [authenticate, originGuard(cfg)]
      : [originGuard(cfg)],
  }, async (req, reply) => {
    try {
      const contentType = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim();

      // MIME allowlist (multipart uploads also re-checked below).
      if (!cfg.uploadAllowedMime.includes(contentType) && !req.isMultipart()) {
        return reply.code(415).send({ error: `Tipe berkas tidak diizinkan: ${contentType}` });
      }

      let buffer;
      let declaredName = String(req.headers['x-file-name'] || '');
      const rawFolder = String(req.headers['x-folder'] || 'uploads');

      if (req.isMultipart()) {
        const part = await req.file();
        if (!part) return reply.code(400).send({ error: 'File kosong.' });
        const partMime = String(part.mimetype || contentType);
        if (!cfg.uploadAllowedMime.includes(partMime)) {
          return reply.code(415).send({ error: `Tipe berkas tidak diizinkan: ${partMime}` });
        }
        buffer = await part.toBuffer();
        if (part.file?.truncated) {
          return reply.code(413).send({ error: 'Ukuran file melebihi batas.' });
        }
        declaredName = declaredName || part.filename || '';
      } else if (Buffer.isBuffer(req.body)) {
        // Raw binary body (legacy contract) — already parsed by the catch-all
        // content-type parser with bodyLimit enforced.
        buffer = req.body;
      } else {
        const chunks = [];
        let total = 0;
        for await (const chunk of req.raw) {
          total += chunk.length;
          if (total > cfg.maxUploadBytes) {
            return reply.code(413).send({ error: 'Ukuran file melebihi batas.' });
          }
          chunks.push(chunk);
        }
        buffer = Buffer.concat(chunks);
      }

      if (!buffer || buffer.length === 0) {
        return reply.code(400).send({ error: 'File kosong.' });
      }
      if (buffer.length > cfg.maxUploadBytes) {
        return reply.code(413).send({ error: 'Ukuran file melebihi batas.' });
      }

      // Folder: allowlist characters, then treat as storage key segment.
      const folder = sanitizeStorageKey(rawFolder.replace(/[^a-zA-Z0-9/_-]/g, '')) || 'uploads';

      // Extension is derived from the SANITIZED filename only, and must be in
      // the allowed extension list — the client MIME/extension is never trusted
      // blindly (MIME confusion defense).
      const ext = path.extname(declaredName).toLowerCase();
      if (!cfg.uploadAllowedExt.includes(ext)) {
        return reply.code(415).send({ error: `Ekstensi berkas tidak diizinkan: ${ext || '(kosong)'}` });
      }

      const baseName = safeFileName(path.basename(declaredName, ext));
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).slice(2, 8);
      const canonicalKey = sanitizeStorageKey(`${folder}/${timestamp}-${randomSuffix}-${baseName}${ext}`);

      const driver = storageDriver;
      const result = await driver.upload(canonicalKey, buffer, { contentType });

      const proxyUrl = `/api/blob?pathname=${encodeURIComponent(canonicalKey)}`;

      // Response contract identical to legacy api/upload.js
      return reply.code(200).send({
        url: proxyUrl,
        blobUrl: result.url,
        proxyUrl,
        pathname: canonicalKey,
        access: 'private',
      });
    } catch (err) {
      if (err.message?.includes('Path traversal') || err.message?.includes('tidak valid')) {
        return reply.code(400).send({ error: 'Nama/folder berkas tidak valid.' });
      }
      req.log.error({ err: err.message }, 'upload failed');
      return reply.code(500).send({ error: err.message || 'Gagal upload file.' });
    }
  });

  // ── Storage delete (admin only; contract for future cleanup UI) ──
  fastify.delete('/api/storage/*', {
    preHandler: [authenticate, requireAdmin, originGuard(cfg)],
  }, async (req, reply) => {
    const rawKey = String(req.params['*'] || '');
    const { canonicalKey } = classifyStorageReference(rawKey);
    if (!canonicalKey) return reply.code(400).send({ error: 'Key tidak valid.' });
    const driver = storageDriver;
    const deleted = await driver.delete(canonicalKey);
    return reply.send({ ok: deleted, key: canonicalKey });
  });

  // ── Health ──
  fastify.get('/health', { config: { rateLimit: false } }, async (_req, reply) => {
    return reply.send({ status: 'ok', uptime: process.uptime() });
  });

  fastify.get('/health/db', { config: { rateLimit: false } }, async (_req, reply) => {
    const healthy = await checkDbHealth();
    if (healthy) return reply.send({ status: 'ok', database: 'connected' });
    return reply.code(503).send({ status: 'error', database: 'disconnected' });
  });

  // ── /storage/*: only served statically when driver=local.
  // Legacy media is PRIVATE (KTP, bukti transfer) -> private media is served
  // through the authenticated /api/blob proxy, NOT as public static files.
  if (cfg.storageDriver === 'local' && cfg.mediaRequireAuthForPrivate === false) {
    await fastify.register(fastifyStatic, {
      root: STORAGE_PATH,
      prefix: '/storage/',
      decorateReply: false,
    });
  }

  // ── SPA static serving (skip cleanly if dist not built yet) ──
  const distExists = fs.existsSync(DIST_PATH);
  if (distExists) {
    await fastify.register(fastifyStatic, {
      root: DIST_PATH,
      prefix: '/',
      wildcard: false,
    });
  }

  fastify.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Endpoint API tidak ditemukan.' });
    }
    if (distExists) return reply.sendFile('index.html');
    return reply.code(404).type('text/html').send('<h1>dist/ belum di-build. Jalankan npm run build.</h1>');
  });

  return fastify;
}

export async function start() {
  const fastify = await buildServer(config);

  const stopServer = async (signal) => {
    fastify.log.info({ signal }, 'Graceful shutdown dimulai…');
    try {
      await fastify.close(); // closes HTTP server; pg pool closed via onClose hook
      process.exit(0);
    } catch (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  };
  process.on('SIGINT', () => stopServer('SIGINT'));
  process.on('SIGTERM', () => stopServer('SIGTERM'));
  fastify.addHook('onClose', async () => { await closePool(); });

  try {
    await fastify.listen({ port: config.port, host: config.host });
    fastify.log.info({ config: redactConfigForLog(config) }, 'KR server siap');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}
