/* eslint-env node */
/* global process */

/**
 * Central configuration + fail-fast validation.
 *
 * Rules:
 * - Secrets come ONLY from environment variables (never hardcoded fallbacks).
 * - In production, missing critical config aborts startup instead of silently
 *   running with an insecure default.
 * - Migration-only variables are never read by this module.
 */

function parseList(value, fallback = []) {
  if (!value || typeof value !== 'string') return fallback;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBytes(value, fallback) {
  if (!value) return fallback;
  const n = Number(String(value).trim());
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const appUrl = env.APP_URL || 'http://localhost:3000';

  const jwtSecret = env.JWT_SECRET || '';
  if (isProd && jwtSecret.length < 32) {
    throw new Error(
      'FATAL: JWT_SECRET wajib diset (minimal 32 karakter) di production. Tidak ada fallback bawaan.'
    );
  }

  const corsOrigins = parseList(env.CORS_ORIGINS, isProd ? [] : ['http://localhost:5173', 'http://localhost:3000']);
  if (isProd && corsOrigins.length === 0) {
    // Default ketat: hanya APP_URL sendiri (SPA disajikan dari origin yang sama).
    corsOrigins.push(appUrl.replace(/\/+$/, ''));
  }

  const config = {
    env: env.NODE_ENV || 'development',
    isProd,
    host: env.HOST || '0.0.0.0',
    port: Number(env.PORT || 3000),
    appUrl,
    distPath: env.DIST_PATH || 'dist',
    databaseUrl: env.DATABASE_URL || '',
    jwtSecret: jwtSecret || 'dev-only-insecure-secret-do-not-use-in-production',
    jwtExpiresIn: env.JWT_EXPIRES_IN || '12h',
    cookieSecure: isProd ? env.COOKIE_SECURE !== 'false' : false,
    cookieSameSite: (env.COOKIE_SAME_SITE || 'lax').toLowerCase(),
    corsOrigins,
    csrfOriginCheck: env.CSRF_ORIGIN_CHECK !== 'false',

    storageDriver: (env.STORAGE_DRIVER || 'local').toLowerCase(),
    localStoragePath: env.LOCAL_STORAGE_PATH || 'storage',
    s3: {
      endpoint: env.S3_ENDPOINT || '',
      accessKeyId: env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: env.S3_SECRET_ACCESS_KEY || '',
      bucket: env.S3_BUCKET || '',
      region: env.S3_REGION || 'auto',
      publicDomain: env.S3_PUBLIC_DOMAIN || '',
    },

    maxUploadBytes: parseBytes(env.MAX_UPLOAD_SIZE, 10 * 1024 * 1024),
    uploadAllowedMime: parseList(env.UPLOAD_ALLOWED_MIME, [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif',
      'application/pdf',
    ]),
    uploadAllowedExt: parseList(env.UPLOAD_ALLOWED_EXT, ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.pdf']),
    uploadRequireAuth: env.UPLOAD_REQUIRE_AUTH !== 'false',
    mediaRequireAuthForPrivate: env.MEDIA_REQUIRE_AUTH_FOR_PRIVATE !== 'false',

    rateLimit: {
      max: Number(env.RATE_LIMIT_MAX || 100),
      window: env.RATE_LIMIT_WINDOW || '1 minute',
      authMax: Number(env.RATE_LIMIT_AUTH_MAX || 10),
      authWindow: env.RATE_LIMIT_AUTH_WINDOW || '10 minutes',
    },

    bootstrap: {
      allowPublicRegister: env.AUTH_ALLOW_PUBLIC_REGISTER === 'true',
    },

    notifCronSecret: env.NOTIF_CRON_SECRET || '',
    vapid: {
      publicKey: env.VAPID_PUBLIC_KEY || '',
      privateKey: env.VAPID_PRIVATE_KEY || '',
      subject: env.VAPID_SUBJECT || 'mailto:admin@kakaramaroom.com',
    },
  };

  if (isProd && !config.databaseUrl) {
    throw new Error('FATAL: DATABASE_URL wajib diset di production.');
  }

  if (config.storageDriver !== 'local' && !config.s3.bucket) {
    throw new Error(`FATAL: STORAGE_DRIVER=${config.storageDriver} membutuhkan S3_BUCKET.`);
  }

  return config;
}

/** Never print secret values. */
export function redactConfigForLog(cfg) {
  return {
    env: cfg.env,
    port: cfg.port,
    host: cfg.host,
    appUrl: cfg.appUrl,
    databaseUrl: cfg.databaseUrl ? '[set]' : '[unset]',
    jwtSecret: cfg.jwtSecret ? '[set]' : '[unset]',
    storageDriver: cfg.storageDriver,
    localStoragePath: cfg.storageDriver === 'local' ? cfg.localStoragePath : '(n/a)',
    s3: {
      endpoint: cfg.s3.endpoint || null,
      bucket: cfg.s3.bucket || null,
      region: cfg.s3.region || null,
      accessKeyId: cfg.s3.accessKeyId ? '[set]' : '[unset]',
      secretAccessKey: cfg.s3.secretAccessKey ? '[set]' : '[unset]',
      publicDomain: cfg.s3.publicDomain || null,
    },
    corsOrigins: cfg.corsOrigins,
    maxUploadBytes: cfg.maxUploadBytes,
    uploadRequireAuth: cfg.uploadRequireAuth,
    mediaRequireAuthForPrivate: cfg.mediaRequireAuthForPrivate,
    rateLimit: cfg.rateLimit,
    vapidConfigured: Boolean(cfg.vapid.publicKey && cfg.vapid.privateKey),
    notifCronSecret: cfg.notifCronSecret ? '[set]' : '[unset]',
  };
}
