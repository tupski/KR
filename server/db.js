// pg Pool dari DATABASE_URL.
import pg from 'pg';

export function createPool(databaseUrl) {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
  });
}