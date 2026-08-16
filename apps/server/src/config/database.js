/**
 * @file database.js
 * @description PostgreSQL connection pool using the `pg` library.
 * Exports a `pool` instance and a convenience `query()` wrapper.
 */

import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

/** @type {pg.PoolConfig} */
const poolConfig = {
  host:     env.DB_HOST,
  port:     env.DB_PORT,
  database: env.DB_NAME,
  user:     env.DB_USER,
  password: env.DB_PASSWORD,
  // Keep connections alive; tune per environment
  max:              10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
};

if (env.DB_SSL === 'true') {
  poolConfig.ssl = { rejectUnauthorized: false };
}

/**
 * Shared PostgreSQL connection pool.
 * @type {pg.Pool}
 */
const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL pool error:', err.message);
});

/**
 * Execute a parameterised SQL query against the pool.
 *
 * @param {string} text - SQL statement (use $1, $2, … for parameters)
 * @param {unknown[]} [params] - Bound parameter values
 * @returns {Promise<pg.QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  if (env.NODE_ENV === 'development') {
    console.log(`🗄  query [${duration}ms] rows=${result.rowCount}`);
  }

  return result;
}

/**
 * Verify the database connection at startup.
 * Logs a success or error message.
 *
 * @returns {Promise<void>}
 */
async function connectDatabase() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log(`✅ Database connected (${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME})`);
  } finally {
    client.release();
  }
}

export { pool, query, connectDatabase };
