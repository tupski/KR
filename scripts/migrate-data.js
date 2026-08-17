#!/usr/bin/env node
/**
 * scripts/migrate-data.js — Data Migration Script
 * 
 * Migrates data from old Supabase backup schema to new clean schema.
 * 
 * Usage:
 *   node scripts/migrate-data.js [--dry-run] [--skip-cleanup]
 * 
 * Options:
 *   --dry-run       Show what would be done without executing
 *   --skip-cleanup  Keep old_schema after migration for inspection
 * 
 * Prerequisites:
 *   1. PostgreSQL superuser access (root user)
 *   2. Old data exists in public schema (from backup restore)
 *   3. Migration files exist in database/migrations/
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve pg + dotenv from apps/server/node_modules
const require = createRequire(import.meta.url);

function resolveFrom(id) {
  const candidates = [
    path.resolve(__dirname, '../apps/server/node_modules', id),
    path.resolve(__dirname, '../node_modules', id),
  ];
  for (const p of candidates) {
    const pkg = path.join(p, 'package.json');
    if (fs.existsSync(pkg)) return p;
  }
  return id;
}

// Load dotenv
const dotenv = require(resolveFrom('dotenv'));
const envCandidates = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../apps/server/.env'),
];
for (const f of envCandidates) {
  if (fs.existsSync(f)) {
    dotenv.config({ path: f });
    console.log(`[env] Loaded: ${path.relative(process.cwd(), f)}`);
    break;
  }
}

// Import pg
let Pool;
try {
  const pg = require(resolveFrom('pg'));
  Pool = pg.Pool;
} catch {
  const pg = await import('pg');
  Pool = pg.Pool;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Database config for application user (from .env)
const appDbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'kakarama_room',
  user: process.env.DB_USER || 'kakarama_app',
  password: process.env.DB_PASSWORD || '',
};

// Superuser config for DDL operations
const superuserConfig = {
  host: process.env.DB_SUPER_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_SUPER_PORT || process.env.DB_PORT || '5432', 10),
  database: process.env.DB_SUPER_NAME || process.env.DB_NAME || 'kakarama_room',
  user: process.env.DB_SUPER_USER || 'root',
  password: process.env.DB_SUPER_PASSWORD || '',
  // Force UTF8 encoding for Windows compatibility
  options: '-c client_encoding=UTF8',
};

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipCleanup = args.includes('--skip-cleanup');

// Expected row counts for validation
const EXPECTED_COUNTS = {
  users: 8,
  transactions: 2729,
  activity_logs: 2712,
  requests: 10,
  tagihan_bulanan: 76,
};

// Migration files in order
const MIGRATION_FILES = [
  '001_extensions.sql',
  '002_auth_tables.sql',
  '003_core_tables.sql',
  '004_notifications.sql',
  '005_finance_tables.sql',
  '006_finance_rpcs.sql',
  '007_analytics_rpcs.sql',
  '008_activity_logs.sql',
  '009_system_settings.sql',
  '010_recurring_bills.sql',
  '011_triggers.sql',
  '012_admin_rpcs.sql',
];

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function log(step, message) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] [${step}] ${message}`);
}

function logSql(sql) {
  if (dryRun) {
    console.log('\n--- SQL ---');
    console.log(sql.trim());
    console.log('--- END ---\n');
  }
}

async function executeSql(pool, sql, label = 'query') {
  logSql(sql);
  if (dryRun) {
    log('DRY-RUN', `Would execute: ${label}`);
    return { rows: [] };
  }
  try {
    const result = await pool.query(sql);
    return result;
  } catch (err) {
    log('ERROR', `${label}: ${err.message}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Migration Steps
// ---------------------------------------------------------------------------

async function createStagingSchema(pool) {
  log('SCHEMA', 'Creating staging schema (old_schema)...');
  
  // First, drop FK constraints that reference auth.users to allow moving tables
  const dropFksSql = `
    -- Drop FK constraints from public tables that reference auth.users
    DO $$
    DECLARE
      constraint_rec record;
    BEGIN
      FOR constraint_rec IN
        SELECT tc.constraint_name, tc.table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND ccu.table_schema = 'auth'
        AND ccu.table_name = 'users'
      LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
          constraint_rec.table_name, constraint_rec.constraint_name);
      END LOOP;
    END $$;
  `;
  
  await executeSql(pool, dropFksSql, 'drop FK constraints to auth.users');
  
  const sql = `
    -- Create staging schema
    DROP SCHEMA IF EXISTS old_schema CASCADE;
    CREATE SCHEMA old_schema;
    
    -- Move existing public tables to staging schema
    DO $$
    DECLARE
      tbl record;
    BEGIN
      FOR tbl IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      LOOP
        EXECUTE format('ALTER TABLE public.%I SET SCHEMA old_schema', tbl.tablename);
      END LOOP;
    END $$;
    
    -- Copy auth.users to old_schema.auth_users (keep original for reference)
    -- We COPY instead of MOVE because auth schema may be needed by other things
    CREATE TABLE old_schema.auth_users AS SELECT * FROM auth.users;
  `;
  
  await executeSql(pool, sql, 'create staging schema');
  log('SCHEMA', 'Staging schema created successfully');
}

async function runMigrations(pool) {
  log('MIGRATE', 'Running migration files to create clean schema...');
  
  const migrationsDir = path.resolve(__dirname, '../database/migrations');
  
  for (const file of MIGRATION_FILES) {
    const filePath = path.join(migrationsDir, file);
    if (!fs.existsSync(filePath)) {
      log('WARN', `Migration file not found: ${file}, skipping...`);
      continue;
    }
    
    log('MIGRATE', `Running: ${file}`);
    
    // Use psql to run migrations with proper UTF-8 encoding support
    const psqlCmd = `psql -h ${superuserConfig.host} -U ${superuserConfig.user} -d ${superuserConfig.database} -f "${filePath}"`;
    
    if (dryRun) {
      log('DRY-RUN', `Would execute: ${psqlCmd}`);
      continue;
    }
    
    try {
      const { execSync } = require('child_process');
      execSync(psqlCmd, {
        stdio: 'pipe',
        env: { ...process.env, PGPASSWORD: superuserConfig.password },
        cwd: process.cwd()
      });
      log('MIGRATE', `Completed: ${file}`);
    } catch (err) {
      // psql returns non-zero exit code for notices/warnings, check if it's a real error
      const stderr = err.stderr ? err.stderr.toString() : '';
      const stdout = err.stdout ? err.stdout.toString() : '';
      
      // Check for actual errors (not just "already exists" notices)
      if (stderr.includes('ERROR') && !stderr.includes('already exists')) {
        log('ERROR', `Migration ${file}: ${stderr}`);
        throw new Error(`Migration failed: ${file}`);
      }
      
      log('MIGRATE', `Completed: ${file} (with notices)`);
    }
  }
  
  log('MIGRATE', 'All migrations completed');
}

async function migrateLokasiApartemen(pool) {
  log('DATA', 'Migrating lokasi_apartemen...');
  
  const sql = `
    INSERT INTO public.lokasi_apartemen (name, total_rooms, created_at)
    SELECT name, total_rooms, created_at
    FROM old_schema.lokasi_apartemen
    ON CONFLICT (name) DO UPDATE SET
      total_rooms = EXCLUDED.total_rooms,
      created_at = EXCLUDED.created_at;
  `;
  
  const result = await executeSql(pool, sql, 'migrate lokasi_apartemen');
  log('DATA', `Migrated ${result.rowCount || 0} locations`);
  return result.rowCount || 0;
}

async function migrateUsers(pool) {
  log('DATA', 'Migrating users from old_schema.auth_users...');
  
  // Check if old_schema.auth_users exists (copied from auth.users)
  const checkResult = await executeSql(pool, `
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'old_schema' AND table_name = 'auth_users'
    ) as exists;
  `, 'check auth_users');
  
  const hasAuthUsers = checkResult.rows[0]?.exists || checkResult.rows[0]?.exists === true;
  
  if (!hasAuthUsers) {
    log('WARN', 'No auth_users table found in old_schema. Trying auth.users directly...');
    
    // Try auth.users directly (in case staging didn't copy it)
    const directCheck = await executeSql(pool, `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'auth' AND table_name = 'users'
      ) as exists;
    `, 'check auth.users direct');
    
    if (!directCheck.rows[0]?.exists) {
      log('ERROR', 'No users source found');
      return 0;
    }
    
    // Use auth.users directly
    const sql = `
      INSERT INTO public.users (id, email, password_hash, created_at, updated_at)
      SELECT
        id,
        email,
        COALESCE(encrypted_password, '') as password_hash,
        COALESCE(created_at, now()) as created_at,
        COALESCE(updated_at, now()) as updated_at
      FROM auth.users
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        updated_at = EXCLUDED.updated_at;
    `;
    const result = await executeSql(pool, sql, 'migrate users from auth.users');
    log('DATA', `Migrated ${result.rowCount || 0} users from auth.users`);
    return result.rowCount || 0;
  }
  
  // Use old_schema.auth_users (copy of auth.users)
  // Note: auth.users has encrypted_password column and potentially a role column
  const sql = `
    INSERT INTO public.users (id, email, password_hash, created_at, updated_at)
    SELECT
      id,
      email,
      COALESCE(encrypted_password, '') as password_hash,
      COALESCE(created_at, now()) as created_at,
      COALESCE(updated_at, now()) as updated_at
    FROM old_schema.auth_users
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      password_hash = EXCLUDED.password_hash,
      updated_at = EXCLUDED.updated_at;
  `;
  
  const result = await executeSql(pool, sql, 'migrate users');
  log('DATA', `Migrated ${result.rowCount || 0} users from old_schema.auth_users`);
  return result.rowCount || 0;
}

async function migrateUserProfiles(pool) {
  log('DATA', 'Migrating user_profiles...');
  
  const sql = `
    INSERT INTO public.user_profiles (id, email, full_name, phone, gender, role, updated_at)
    SELECT 
      id, 
      email, 
      full_name, 
      phone, 
      gender, 
      COALESCE(role, 'karyawan') as role,
      COALESCE(updated_at, now()) as updated_at
    FROM old_schema.user_profiles
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      phone = EXCLUDED.phone,
      gender = EXCLUDED.gender,
      role = EXCLUDED.role,
      updated_at = EXCLUDED.updated_at;
  `;
  
  const result = await executeSql(pool, sql, 'migrate user_profiles');
  log('DATA', `Migrated ${result.rowCount || 0} user profiles`);
  return result.rowCount || 0;
}

async function migrateUserRoles(pool) {
  log('DATA', 'Migrating user_roles...');
  
  const sql = `
    INSERT INTO public.user_roles (user_id, role, updated_at)
    SELECT
      o.user_id,
      COALESCE(o.role, 'karyawan') as role,
      COALESCE(o.updated_at, now()) as updated_at
    FROM old_schema.user_roles o
    ON CONFLICT (user_id) DO UPDATE SET
      role = EXCLUDED.role,
      updated_at = EXCLUDED.updated_at;
  `;
  
  const result = await executeSql(pool, sql, 'migrate user_roles');
  log('DATA', `Migrated ${result.rowCount || 0} user roles`);
  return result.rowCount || 0;
}

async function addRoleColumnToUsers(pool) {
  log('CRITICAL', 'Adding role column to public.users (required for auth)...');
  
  const sql = `
    -- Add role column if not exists
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'role'
      ) THEN
        ALTER TABLE public.users ADD COLUMN role TEXT DEFAULT 'karyawan';
      END IF;
    END $$;
    
    -- Populate role from user_roles or user_profiles
    UPDATE public.users u
    SET role = COALESCE(
      (SELECT role FROM public.user_roles WHERE user_id = u.id LIMIT 1),
      (SELECT role FROM public.user_profiles WHERE id = u.id LIMIT 1),
      'karyawan'
    )
    WHERE u.role IS NULL OR u.role = 'karyawan';
  `;
  
  await executeSql(pool, sql, 'add role column to users');
  log('CRITICAL', 'Role column added and populated successfully');
}

async function migrateTransactions(pool) {
  log('DATA', 'Migrating transactions (largest table)...');
  
  // Note: payment_cash and payment_transfer are generated columns (STORED)
  // They are auto-generated from cash_amount and transfer_amount, so we exclude them
  const sql = `
    INSERT INTO public.transactions (
      id, user_id, customer_name, apartment_location, room_number,
      checkin_at, rental_duration, shift, input_by,
      cash_amount, transfer_amount, marketing_name, marketing_fee,
      ktp_image_url, transfer_proof_url, created_at, updated_at,
      deposit_cash, deposit_transfer, deposit_returned_at, deposit_refund_proof_url,
      check_in, check_out, duration_days, price_per_day, total_price,
      guest_source, notes
    )
    SELECT
      id,
      user_id,
      customer_name,
      apartment_location,
      room_number,
      checkin_at,
      rental_duration,
      shift,
      input_by,
      cash_amount,
      transfer_amount,
      marketing_name,
      marketing_fee,
      ktp_image_url,
      transfer_proof_url,
      created_at,
      updated_at,
      deposit_cash,
      deposit_transfer,
      deposit_returned_at,
      deposit_refund_proof_url,
      check_in,
      check_out,
      duration_days,
      price_per_day,
      total_price,
      guest_source,
      notes
    FROM old_schema.transactions;
    
    -- Update sequence to continue from max id
    SELECT setval('public.transactions_id_seq', COALESCE((SELECT MAX(id) FROM public.transactions), 1));
  `;
  
  const result = await executeSql(pool, sql, 'migrate transactions');
  log('DATA', `Migrated ${result.rowCount || 0} transactions`);
  return result.rowCount || 0;
}

async function migrateActivityLogs(pool) {
  log('DATA', 'Migrating activity_logs...');
  
  const sql = `
    INSERT INTO public.activity_logs (id, user_id, user_name, role, action, details, metadata, created_at)
    SELECT id, user_id, user_name, role, action, details, metadata, created_at
    FROM old_schema.activity_logs;
    
    -- Update sequence
    SELECT setval('public.activity_logs_id_seq', COALESCE((SELECT MAX(id) FROM public.activity_logs), 1));
  `;
  
  const result = await executeSql(pool, sql, 'migrate activity_logs');
  log('DATA', `Migrated ${result.rowCount || 0} activity logs`);
  return result.rowCount || 0;
}

async function migrateRequests(pool) {
  log('DATA', 'Migrating requests...');
  
  const sql = `
    INSERT INTO public.requests (
      id, employee_name, apartment_location, request_type, description,
      amount, desired_date, status, user_id, created_at, updated_at
    )
    SELECT 
      id, employee_name, apartment_location, request_type, description,
      amount, desired_date, status, user_id, created_at, updated_at
    FROM old_schema.requests;
    
    -- Update sequence
    SELECT setval('public.requests_id_seq', COALESCE((SELECT MAX(id) FROM public.requests), 1));
  `;
  
  const result = await executeSql(pool, sql, 'migrate requests');
  log('DATA', `Migrated ${result.rowCount || 0} requests`);
  return result.rowCount || 0;
}

async function migrateTagihanBulanan(pool) {
  log('DATA', 'Migrating tagihan_bulanan...');
  
  const sql = `
    INSERT INTO public.tagihan_bulanan (
      id, apartment_location, month, year, billing_date,
      pdam_amount, listrik_amount, service_amount, other_amount,
      pdam_proof_url, listrik_proof_url, other_description,
      status, created_at, updated_at
    )
    SELECT 
      id, apartment_location, month, year, billing_date,
      pdam_amount, listrik_amount, service_amount, other_amount,
      pdam_proof_url, listrik_proof_url, other_description,
      status, created_at, updated_at
    FROM old_schema.tagihan_bulanan;
    
    -- Update sequence
    SELECT setval('public.tagihan_bulanan_id_seq', COALESCE((SELECT MAX(id) FROM public.tagihan_bulanan), 1));
  `;
  
  const result = await executeSql(pool, sql, 'migrate tagihan_bulanan');
  log('DATA', `Migrated ${result.rowCount || 0} tagihan_bulanan`);
  return result.rowCount || 0;
}

async function validateMigration(pool) {
  log('VALIDATE', 'Validating migration results...');
  
  const sql = `
    SELECT 
      'users' as table_name, COUNT(*) as count FROM public.users
    UNION ALL
    SELECT 'transactions', COUNT(*) FROM public.transactions
    UNION ALL
    SELECT 'activity_logs', COUNT(*) FROM public.activity_logs
    UNION ALL
    SELECT 'requests', COUNT(*) FROM public.requests
    UNION ALL
    SELECT 'tagihan_bulanan', COUNT(*) FROM public.tagihan_bulanan;
  `;
  
  const result = await executeSql(pool, sql, 'validate counts');
  
  let allValid = true;
  console.log('\n=== Validation Results ===\n');
  
  for (const row of result.rows) {
    const expected = EXPECTED_COUNTS[row.table_name] || 0;
    const actual = parseInt(row.count, 10);
    const status = actual >= expected ? '✓' : '✗';
    const diff = actual - expected;
    
    console.log(`  ${status} ${row.table_name}: ${actual} rows (expected ${expected}, diff: ${diff >= 0 ? '+' : ''}${diff})`);
    
    if (actual < expected) {
      allValid = false;
    }
  }
  
  // Check role column in users
  const roleCheck = await executeSql(pool, `
    SELECT COUNT(*) as count FROM public.users WHERE role IS NOT NULL;
  `, 'check role column');
  
  const usersWithRole = parseInt(roleCheck.rows[0]?.count || 0, 10);
  console.log(`  ${usersWithRole > 0 ? '✓' : '✗'} users with role: ${usersWithRole}`);
  
  if (usersWithRole === 0) {
    allValid = false;
  }
  
  console.log('\n=========================\n');
  
  return allValid;
}

async function cleanupOldSchema(pool) {
  if (skipCleanup) {
    log('CLEANUP', 'Skipping cleanup (--skip-cleanup flag set)');
    return;
  }
  
  log('CLEANUP', 'Dropping old_schema...');
  
  const sql = 'DROP SCHEMA IF EXISTS old_schema CASCADE;';
  await executeSql(pool, sql, 'drop old_schema');
  
  log('CLEANUP', 'Old schema dropped successfully');
}

// ---------------------------------------------------------------------------
// Main Migration Flow
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         Kakarama Room Data Migration Script               ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  if (dryRun) {
    log('INFO', 'DRY-RUN MODE: No changes will be made');
  }
  
  // Create pool with superuser for DDL operations
  const pool = new Pool({
    ...superuserConfig,
    max: 1,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  
  try {
    // Test connection and set UTF8 encoding
    log('CONN', 'Connecting to database...');
    await pool.query('SELECT NOW()');
    
    // Set UTF8 encoding to handle special characters in migration files
    await pool.query("SET client_encoding = 'UTF8'");
    log('CONN', 'Connected successfully (UTF8 encoding set)');
    
    // Phase 1: Create staging schema
    await createStagingSchema(pool);
    
    // Phase 2: Run migrations to create clean schema
    await runMigrations(pool);
    
    // Phase 3: Migrate data in dependency order
    const counts = {};
    
    counts.lokasi = await migrateLokasiApartemen(pool);
    counts.users = await migrateUsers(pool);
    counts.profiles = await migrateUserProfiles(pool);
    counts.roles = await migrateUserRoles(pool);
    
    // CRITICAL: Add role column to users (required for auth)
    await addRoleColumnToUsers(pool);
    
    counts.transactions = await migrateTransactions(pool);
    counts.activity_logs = await migrateActivityLogs(pool);
    counts.requests = await migrateRequests(pool);
    counts.tagihan = await migrateTagihanBulanan(pool);
    
    // Phase 4: Validate migration
    const valid = await validateMigration(pool);
    
    if (!valid && !dryRun) {
      log('ERROR', 'Validation failed! Check counts above.');
      log('INFO', 'Old schema preserved for inspection.');
      process.exit(1);
    }
    
    // Phase 5: Cleanup
    await cleanupOldSchema(pool);
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                 Migration Complete!                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    if (dryRun) {
      log('INFO', 'Dry-run complete. Run without --dry-run to apply changes.');
    }
    
  } catch (err) {
    log('FATAL', `Migration failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
main();
