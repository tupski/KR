/* eslint-env node */
/* global process */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import dotenv from 'dotenv';
import { getStorageDriver, sanitizeStorageKey, toCanonicalKey } from './storage/index.js';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import { checkDbHealth } from './db/index.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const STORAGE_PATH = process.env.LOCAL_STORAGE_PATH || path.resolve(process.cwd(), 'storage');
const DIST_PATH = path.resolve(process.cwd(), 'dist');
const JWT_SECRET = process.env.JWT_SECRET || 'kr-app-super-secret-jwt-key-2026';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url,
          headers: {
            host: req.headers.host,
            'user-agent': req.headers['user-agent'],
          },
        };
      },
    },
  },
  disableRequestLogging: false,
});

await fastify.register(fastifyCors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

await fastify.register(fastifyCookie);
await fastify.register(fastifyJwt, {
  secret: JWT_SECRET,
  cookie: {
    cookieName: 'token',
    signed: false,
  },
});

await fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// Register Business API & Auth Routes
await fastify.register(authRoutes);
await fastify.register(apiRoutes);

// Storage static serving
await fastify.register(fastifyStatic, {
  root: STORAGE_PATH,
  prefix: '/storage/',
  decorateReply: false,
});

// Health endpoints
fastify.get('/health', async (_req, reply) => {
  return reply.send({ status: 'ok', uptime: process.uptime() });
});

fastify.get('/health/db', async (_req, reply) => {
  const healthy = await checkDbHealth();
  if (healthy) return reply.send({ status: 'ok', database: 'connected' });
  return reply.code(503).send({ status: 'error', database: 'disconnected' });
});

// Legacy /api/blob proxy endpoint
fastify.get('/api/blob', async (req, reply) => {
  const pathname = String(req.query.pathname || '').replace(/^\/+/, '');
  if (!pathname) {
    return reply.code(400).send({ error: 'Parameter pathname wajib diisi.' });
  }

  const driver = getStorageDriver();
  const canonicalKey = toCanonicalKey(pathname);

  try {
    const data = await driver.get(canonicalKey);
    if (!data) {
      return reply.code(404).send({ error: 'File tidak ditemukan di storage.' });
    }

    reply.header('Cache-Control', 'public, max-age=300');
    return reply.send(data);
  } catch (err) {
    req.log.error(err);
    return reply.code(500).send({ error: 'Gagal mengambil file storage.' });
  }
});

// Upload endpoint compatible with existing /api/upload
fastify.post('/api/upload', async (req, reply) => {
  try {
    const rawName = req.headers['x-file-name'] || `file-${Date.now()}`;
    const folder = (req.headers['x-folder'] || 'uploads').toString().replace(/[^a-zA-Z0-9/_-]/g, '');
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    let buffer;
    if (req.isMultipart()) {
      const part = await req.file();
      if (!part) return reply.code(400).send({ error: 'File kosong.' });
      buffer = await part.toBuffer();
    } else {
      buffer = await req.body;
      if (!buffer || buffer.length === 0) {
        const chunks = [];
        for await (const chunk of req.raw) {
          chunks.push(chunk);
        }
        buffer = Buffer.concat(chunks);
      }
    }

    if (!buffer || buffer.length === 0) {
      return reply.code(400).send({ error: 'File kosong.' });
    }

    const safeName = sanitizeStorageKey(rawName);
    const canonicalKey = `uploads/${folder}/${safeName}`;

    const driver = getStorageDriver();
    const result = await driver.upload(canonicalKey, buffer, { contentType });

    const proxyUrl = `/api/blob?pathname=${encodeURIComponent(canonicalKey)}`;

    return reply.code(200).send({
      url: result.url,
      blobUrl: result.url,
      proxyUrl,
      pathname: canonicalKey,
      access: 'public',
    });
  } catch (err) {
    req.log.error(err);
    return reply.code(500).send({ error: err.message || 'Gagal upload file.' });
  }
});

// Serve frontend dist SPA
await fastify.register(fastifyStatic, {
  root: DIST_PATH,
  prefix: '/',
});

fastify.setNotFoundHandler((req, reply) => {
  if (req.raw.url && req.raw.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'Endpoint API tidak ditemukan.' });
  }
  return reply.sendFile('index.html');
});

// Graceful Shutdown
const stopServer = async () => {
  fastify.log.info('Menerima sinyal shutdown, mematikan server...');
  await fastify.close();
  process.exit(0);
};

process.on('SIGINT', stopServer);
process.on('SIGTERM', stopServer);

export async function start() {
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`[KR Server] Berjalan di http://${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}
