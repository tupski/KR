// CLI migrate: node server/migrate-cli.js
import 'dotenv/config';
import { createPool } from './db.js';
import { migrate } from './migrate.js';

const pool = createPool(process.env.DATABASE_URL);
try {
  await migrate(pool);
  console.log('migrations applied');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}