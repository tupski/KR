#!/usr/bin/env node
/**
 * database/migrate.js  — ESM migration runner (PostgreSQL lokal, tanpa Supabase)
 *
 * Usage:
 *   node database/migrate.js                                  # semua migrations
 *   node database/migrate.js --file 007_analytics_rpcs.sql   # satu file
 *   node database/migrate.js --seeds                         # semua seeds
 *   node database/migrate.js --file ../seeds/001_initial_data.sql
 *
 * Env vars (dibaca dari root .env atau apps/server/.env):
 *   DATABASE_URL=postgres://user:pass@host:port/dbname
 *   atau DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 */

import path     from 'path';
import fs       from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Resolve pg + dotenv from apps/server/node_modules (where they are installed)
// ---------------------------------------------------------------------------
const require = createRequire(import.meta.url);

function resolveFrom(id) {
  const candidates = [
    path.resolve(__dirname, '../apps/server/node_modules', id),
    path.resolve(__dirname, '../node_modules', id),
  ];
  for (const p of candidates) {
    // Try the main entry point heuristics
    const pkg = path.join(p, 'package.json');
    if (fs.existsSync(pkg)) return p;
  }
  // Fall back to normal require resolution
  return id;
}

// Load dotenv
try {
  const dotenvPath = path.join(resolveFrom('dotenv'), 'config.js');
  // dotenv is CJS; use createRequire to call its config()
  const dotenv = require(resolveFrom('dotenv'));

  const envCandidates = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../apps/server/.env'),
  ];
  let loaded = false;
  for (const f of envCandidates) {
    if (fs.existsSync(f)) {
      dotenv.config({ path: f });
      console.log(`[env]   Loaded: ${path.relative(process.cwd(), f)}`);
      loaded = true;
      break;
    }
  }
  if (!loaded) console.warn('[env]   No .env file found — relying on process.env');
} catch {
  console.warn('[env]   dotenv not available — relying on process.env');
}

// Load pg
let Pool;
try {
  const pg = require(resolveFrom('pg'));
  Pool = pg.Pool;
} catch {
  // Try direct import as fallback
  const { default: pg } = await import('pg');
  Pool = pg.Pool;
}

// ---------------------------------------------------------------------------
// DB config
// ---------------------------------------------------------------------------
function buildPoolConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME     || 'kakarama',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
  };
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { file: null, seeds: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) opts.file = args[++i];
    else if (args[i] === '--seeds') opts.seeds = true;
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Collect SQL files
// ---------------------------------------------------------------------------
function getSqlFiles(dir) {
  if (!fs.existsSync(dir)) {
    console.warn(`[warn]  Directory not found: ${dir}`);
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.sql') && f !== '.gitkeep')
    .sort()
    .map(f => path.join(dir, f));
}

function collectFiles(opts) {
  const migrationsDir = path.resolve(__dirname, 'migrations');
  const seedsDir      = path.resolve(__dirname, 'seeds');

  if (opts.file) {
    let filePath = path.isAbsolute(opts.file)
      ? opts.file
      : path.resolve(migrationsDir, opts.file);
    if (!fs.existsSync(filePath)) {
      filePath = path.resolve(seedsDir, opts.file);
    }
    if (!fs.existsSync(filePath)) {
      console.error(`[error] File not found: ${opts.file}`);
      process.exit(1);
    }
    return [filePath];
  }

  return opts.seeds ? getSqlFiles(seedsDir) : getSqlFiles(migrationsDir);
}

// ---------------------------------------------------------------------------
// Run a single SQL file inside a single client (not a transaction, to allow
// DDL statements that PostgreSQL auto-commits)
// ---------------------------------------------------------------------------
async function runFile(pool, filePath) {
  const label = path.relative(process.cwd(), filePath);
  const sql   = fs.readFileSync(filePath, 'utf8');

  if (!sql.trim()) {
    console.log(`[skip]  ${label} (empty)`);
    return;
  }

  const client = await pool.connect();
  try {
    console.log(`[run]   ${label}`);
    await client.query(sql);
    console.log(`[ok]    ${label}`);
  } catch (err) {
    console.error(`[fail]  ${label}`);
    console.error(`        ${err.message}`);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const opts  = parseArgs(process.argv);
  const files = collectFiles(opts);

  if (files.length === 0) {
    console.log('[info]  No SQL files found.');
    return;
  }

  console.log(`[info]  ${files.length} file(s) to run`);

  const pool = new Pool(buildPoolConfig());

  // Verify connection
  try {
    const client = await pool.connect();
    const res    = await client.query('SELECT current_database(), version()');
    const { current_database, version } = res.rows[0];
    console.log(`[db]    Connected to "${current_database}"`);
    console.log(`[db]    ${version.split(' ').slice(0, 2).join(' ')}`);
    client.release();
  } catch (err) {
    console.error('[error] Cannot connect to database:', err.message);
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  for (const filePath of files) {
    try {
      await runFile(pool, filePath);
      passed++;
    } catch {
      failed++;
      // Continue to surface all failures at once
    }
  }

  await pool.end();

  console.log('');
  console.log(`[done]  ${passed} passed, ${failed} failed`);

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('[fatal]', err.message);
  process.exit(1);
});
