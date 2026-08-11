// Env config: baca .env via dotenv, validasi startup, tanpa hardcoded secret.
import 'dotenv/config';

export function loadConfig(env = process.env) {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const missing = required.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error('missing required env: ' + missing.join(', '));
  }
  if (env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 chars');
  }
  return {
    port: Number(env.PORT) || 3000,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    cookieSecure: env.COOKIE_SECURE === 'true',
    sessionTtl: env.JWT_TTL || '7d',
    storageProvider: env.STORAGE_PROVIDER || 'r2',
    distDir: env.DIST_DIR || 'dist',
    bodyLimit: env.BODY_LIMIT || '10mb',
  };
}