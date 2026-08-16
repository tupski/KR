/**
 * @file app.js
 * @description Express application factory.
 * Sets up middleware, mounts routes, and attaches the global error handler.
 */

import express from 'express';
import { corsMiddleware } from './middleware/cors.middleware.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes         from './modules/auth/auth.routes.js';
import storageRoutes      from './modules/storage/storage.routes.js';
import usersRoutes        from './modules/users/users.routes.js';
import transactionsRoutes from './modules/transactions/transactions.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import settingsRoutes     from './modules/settings/settings.routes.js';
import pengeluaranRoutes  from './modules/pengeluaran/pengeluaran.routes.js';

const app = express();

// ── Core middleware ───────────────────────────────────────────────────────────
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/storage',       storageRoutes);
app.use('/api/users',         usersRoutes);
app.use('/api/transactions',  transactionsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/settings',      settingsRoutes);
app.use('/api/pengeluaran',   pengeluaranRoutes);

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// ── Global error handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

export { app };
