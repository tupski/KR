/**
 * @file server.js
 * @description Application entry point.
 * Validates env vars, tests the DB connection, then starts the HTTP server.
 *
 * Import order matters:
 *   1. env.js  — validates & exports env vars (exits on invalid config)
 *   2. database.js — creates the pg pool and verifies connectivity
 *   3. app.js  — the Express application
 */

// 1. Validate environment variables first — process.exit() if invalid
import { env } from './config/env.js';

// 2. Database pool (uses env internally)
import { connectDatabase } from './config/database.js';

// 3. Express app
import { app } from './app.js';

// ── Uncaught error safety nets ────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason);
  process.exit(1);
});

// ── Startup ───────────────────────────────────────────────────────────────────

async function start() {
  try {
    // Verify database is reachable before accepting traffic
    await connectDatabase();

    const server = app.listen(env.PORT, () => {
      console.log(`🚀 Server running on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
    });

    // Graceful shutdown
    const shutdown = (signal) => {
      console.log(`\n${signal} received — shutting down gracefully`);
      server.close(() => {
        console.log('✅ HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();
