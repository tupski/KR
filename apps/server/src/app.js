/**
 * @file app.js
 * @description Express application factory.
 * Sets up middleware, mounts routes, and attaches the global error handler.
 */

import express from 'express';
import { corsMiddleware } from './middleware/cors.middleware.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes          from './modules/auth/auth.routes.js';
import storageRoutes       from './modules/storage/storage.routes.js';
import usersRoutes         from './modules/users/users.routes.js';
import transactionsRoutes  from './modules/transactions/transactions.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import settingsRoutes      from './modules/settings/settings.routes.js';
import pengeluaranRoutes   from './modules/pengeluaran/pengeluaran.routes.js';
import analyticsRoutes     from './modules/analytics/analytics.routes.js';
import financeRoutes       from './modules/finance/finance.routes.js';
import requestsRoutes      from './modules/requests/requests.routes.js';
import activityLogsRoutes  from './modules/activity-logs/activityLogs.routes.js';
import locationsRoutes     from './modules/locations/locations.routes.js';

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
app.use('/api/auth',           authRoutes);
app.use('/api/storage',        storageRoutes);
app.use('/api/users',          usersRoutes);
app.use('/api/transactions',   transactionsRoutes);
app.use('/api/notifications',  notificationsRoutes);
app.use('/api/settings',       settingsRoutes);
app.use('/api/pengeluaran',    pengeluaranRoutes);
app.use('/api/analytics',      analyticsRoutes);
app.use('/api/finance',        financeRoutes);
app.use('/api/requests',       requestsRoutes);
app.use('/api/activity-logs',  activityLogsRoutes);
app.use('/api/locations',      locationsRoutes);

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// ── Global error handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

export { app };
