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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp({ cfg = loadConfig(), pool = createPool(cfg.databaseUrl) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: cfg.bodyLimit }));
  app.use(cookieParser());
  app.use(csrfGuard);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes({ pool, cfg }));
  app.use('/api/db', dbRoutes({ pool, cfg }));
  app.use('/api/rpc', rpcBridge({ pool, cfg }));
  app.use('/api/storage', storageRoutes);

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
    res.status(err.status || 500).json({ error: err.message || 'Internal error' });
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