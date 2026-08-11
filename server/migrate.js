// Migrasi runner: jalankan file SQL dari migrations/self_host/ sekali, track schema_migrations.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations', 'self_host');

export async function migrate(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  const { rows } = await pool.query('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.version));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${file} failed: ${e.message}`);
    } finally {
      client.release();
    }
  }
  return { applied: files };
}