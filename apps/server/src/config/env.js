/**
 * @file env.js
 * @description Validates and exports all environment variables using Zod.
 * Fails fast at startup if any required variable is missing or malformed.
 */

import { z } from 'zod';
import { config } from 'dotenv';

// Load .env file from the server app root
config();

const envSchema = z.object({
  // ── Database ──────────────────────────────────────────────────────────────
  DB_HOST:     z.string().min(1, 'DB_HOST is required'),
  DB_PORT:     z.coerce.number().int().positive().default(5432),
  DB_NAME:     z.string().min(1, 'DB_NAME is required'),
  DB_USER:     z.string().min(1, 'DB_USER is required'),
  DB_PASSWORD: z.string().min(1, 'DB_PASSWORD is required'),
  DB_SSL:      z.enum(['true', 'false']).default('false'),

  // ── JWT ───────────────────────────────────────────────────────────────────
  JWT_SECRET:              z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET:      z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_EXPIRES_IN:          z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN:  z.string().default('30d'),

  // ── Server ────────────────────────────────────────────────────────────────
  PORT:         z.coerce.number().int().positive().default(3001),
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL'),
  NODE_ENV:     z.enum(['development', 'production', 'test']).default('development'),

  // ── App ───────────────────────────────────────────────────────────────────
  APP_PIN: z.string().min(4, 'APP_PIN must be at least 4 chars'),
});

/**
 * Parsed and validated environment variables.
 * @type {z.infer<typeof envSchema>}
 */
let env;

try {
  env = envSchema.parse(process.env);
} catch (err) {
  if (err instanceof z.ZodError) {
    const issues = err.errors.map((e) => `  • ${e.path.join('.')}: ${e.message}`).join('\n');
    console.error('❌ Invalid environment variables:\n' + issues);
    process.exit(1);
  }
  throw err;
}

export { env };
