/* eslint-env node */
/* global process */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString: connectionString || undefined,
  max: Number(process.env.PG_MAX_CONNECTIONS || 20),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('[DB EXEC]', { text, duration, rows: res.rowCount });
  }
  return res;
}

export async function checkDbHealth() {
  try {
    const res = await pool.query('SELECT 1 as healthy');
    return res.rows[0]?.healthy === 1;
  } catch (_e) {
    return false;
  }
}
