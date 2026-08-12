// Express server: static dist/, SPA fallback, API routes, error handler.
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';
import { csrfGuard } from './auth.js';
import authRoutes from './routes/authRoutes.js';
import dbRoutes from './routes/dbRoutes.js';
import rpcBridge from './routes/rpcBridge.js';
import storageRoutes from './routes/storageRoutes.js';
import installRoutes from './routes/installRoutes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// T5: maintenance mode dari system_settings (cache 30s). Exempt: login, health, install/*, super_admin.
export function maintenanceMiddleware({ pool, cacheMs = 30_000 } = {}) {
  let cached = null;
  let cachedAt = 0;
  return async (req, res, next) => {
    if (!req.path.startsWith('/api/') || req.path.startsWith('/api/install/') ||
        req.path === '/api/auth/login' || req.path === '/api/health') {
      return next();
    }
    const now = Date.now();
    if (!cached || now - cachedAt > cacheMs) {
      try {
        const { rows } = await pool.query(`SELECT value FROM system_settings WHERE key = 'maintenance_mode'`);
        cached = rows[0]?.value === true || rows[0]?.value === 'true';
        cachedAt = now;
      } catch {
        cached = false; // DB belum siap → tidak blokir boot/install path
      }
    }
    if (cached && req.user?.role !== 'super_admin') {
      return res.status(503).json({ error: 'Maintenance mode aktif' });
    }
    return next();
  };
}

export function createApp({ cfg = loadConfig(), pool = createPool(cfg.databaseUrl), install } = {}) {
  const app = express();
  app.disable('x-powered-by');
  const corsOrigins = (cfg.corsOrigins || []).map((o) => o.toLowerCase());
  const corsOptions = {
    origin(origin, cb) {
      if (!origin) return cb(null, true); // same-origin / non-browser
      const host = origin.replace(/^https?:\/\//, '').replace(/:\d+$/, '').toLowerCase();
      if (corsOrigins.includes(origin.toLowerCase()) || corsOrigins.includes(host)) return cb(null, true);
      return cb(null, false); // tolak: tanpa CORS headers
    },
    credentials: true,
  };
  app.use(cors(corsOptions));
  app.use(express.json({ limit: cfg.bodyLimit }));
  app.use(cookieParser());
  app.use(csrfGuard);
  app.use(maintenanceMiddleware({ pool }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes({ pool, cfg }));
  app.use('/api/db', dbRoutes({ pool, cfg }));
  app.use('/api/rpc', rpcBridge({ pool, cfg }));
  app.use('/api/storage', storageRoutes({ pool, cfg }));
  app.use('/api/install', installRoutes({ configDir: cfg.configDir, ...(install || {}) }));

  const dist = path.join(root, cfg.distDir);
  const apiPath = (p) => p.startsWith('/api/');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res, next) => {
      if (apiPath(req.path)) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  } else {
    app.get('*', (req, res, next) => {
      if (apiPath(req.path)) return next();
      res.status(404).json({ error: 'dist/ not built — run npm run build' });
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : (err.message || 'Bad request') });
  });

  return app;
}

async function main() {
  const cfg = loadConfig();
  const pool = createPool(cfg.databaseUrl);
  await migrate(pool);
  const app = createApp({ cfg, pool });
  app.listen(cfg.port, () => {
    console.log(`KR self-host listening on :${cfg.port}`);
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}