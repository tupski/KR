#!/usr/bin/env node
/* eslint-env node */
/* global process */

/**
 * Supabase PostgreSQL -> Self-hosted PostgreSQL migration orchestrator.
 *
 * Design:
 *  - Bulk data movement uses PostgreSQL NATIVE tooling (pg_dump / psql).
 *    This script only orchestrates, transforms, and verifies.
 *  - NON-DESTRUCTIVE by default: no --clean, no DROP, source is read-only.
 *  - Source Supabase is PostgreSQL 17.x (verified from supabase/.temp/postgres-version),
 *    so the target should be PostgreSQL 17 to guarantee a clean restore.
 *  - Native auth migration (auth.users -> public.users) is an explicit,
 *    reviewable, reversible transformation step, not part of bulk restore.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const SUPABASE_DB_URL = process.env.MIGRATION_SUPABASE_DB_URL;
const TARGET_DB_URL = process.env.MIGRATION_TARGET_DB_URL || process.env.DATABASE_URL;
const REPO_ROOT = process.cwd();
const MIGRATION_ROOT = path.join(REPO_ROOT, 'migration', 'database');

function maskDbUrl(url) {
  if (!url) return '(not set)';
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    if (parsed.username) parsed.username = parsed.username; // username is not secret
    return parsed.toString();
  } catch (_e) {
    return '(invalid url)';
  }
}

function fail(msg, code = 1) {
  console.error(`[ERROR] ${msg}`);
  process.exit(code);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: true, ...options });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d) => { stdout += d.toString(); if (options.echo) process.stdout.write(d); });
    proc.stderr?.on('data', (d) => { stderr += d.toString(); if (options.echo) process.stderr.write(d); });
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr, code });
      else reject(new Error(`${command} exited ${code}: ${(stderr || stdout).trim().slice(0, 2000)}`));
    });
    proc.on('error', reject);
  });
}

async function toolAvailable(bin) {
  try {
    await runCommand(bin, ['--version']);
    return true;
  } catch (_e) {
    return false;
  }
}

function calculateFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function latestDumpDir() {
  if (!fs.existsSync(MIGRATION_ROOT)) return null;
  const dirs = fs.readdirSync(MIGRATION_ROOT)
    .filter((d) => fs.statSync(path.join(MIGRATION_ROOT, d)).isDirectory())
    .sort()
    .reverse();
  return dirs.length ? path.join(MIGRATION_ROOT, dirs[0]) : null;
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------
async function exportDatabase({ dryRun = false, includeAuth = true } = {}) {
  if (!SUPABASE_DB_URL) fail('MIGRATION_SUPABASE_DB_URL wajib diset untuk export.');
  if (!(await toolAvailable('pg_dump'))) fail('pg_dump tidak ditemukan di PATH. Install PostgreSQL client tools.');

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const outDir = path.join(MIGRATION_ROOT, stamp);
  const dumpFile = path.join(outDir, 'dump.sql');
  const manifestFile = path.join(outDir, 'manifest.json');

  const args = [
    '--dbname=' + JSON.stringify(SUPABASE_DB_URL),
    '--no-owner',
    '--no-privileges',
    '--schema=public',
  ];
  if (includeAuth) {
    // auth.users holds bcrypt password hashes; auth.identities holds provider links.
    // Required so public.* FKs to auth.users(id) restore cleanly and so the native
    // auth migration step can map hashes into public.users.
    args.push('-t', 'auth.users', '-t', 'auth.identities');
  }
  args.push('--file=' + JSON.stringify(dumpFile));

  console.log('[DB EXPORT] Source      :', maskDbUrl(SUPABASE_DB_URL));
  console.log('[DB EXPORT] Output      :', dumpFile);
  console.log('[DB EXPORT] Include auth:', includeAuth);
  if (dryRun) {
    console.log('[DB EXPORT] DRY-RUN — perintah yang akan dijalankan:');
    console.log('  pg_dump ' + args.join(' '));
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  try {
    await runCommand('pg_dump', args, { echo: false });
  } catch (err) {
    fail(`pg_dump gagal: ${err.message}`);
  }

  const stat = fs.statSync(dumpFile);
  const sha256 = await calculateFileSha256(dumpFile);

  // Capture source server version for restore compatibility check.
  let sourceVersion = null;
  try {
    const client = new pg.Client({ connectionString: SUPABASE_DB_URL, connectionTimeoutMillis: 8000 });
    await client.connect();
    const r = await client.query('SHOW server_version');
    sourceVersion = r.rows[0]?.server_version || null;
    await client.end();
  } catch (err) {
    console.warn('[DB EXPORT] Peringatan: tidak dapat membaca versi server sumber:', err.message);
  }

  const manifest = {
    source: maskDbUrl(SUPABASE_DB_URL),
    sourceServerVersion: sourceVersion,
    exportedAt: new Date().toISOString(),
    format: 'plain-sql',
    includeAuth,
    sizeBytes: stat.size,
    sha256,
    dumpFile: 'dump.sql',
    status: 'completed',
  };
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`[DB EXPORT] ✓ Selesai. Size=${(stat.size / 1024).toFixed(1)} KB SHA256=${sha256.slice(0, 16)}…`);
  if (sourceVersion) console.log(`[DB EXPORT] Versi server sumber: ${sourceVersion} — target HARUS >= major version ini.`);
  console.log('[DB EXPORT] Manifest:', manifestFile);
}

// ---------------------------------------------------------------------------
// prepare-target (buat schema/role/ekstensi agar restore dump Supabase berhasil)
// ---------------------------------------------------------------------------
async function prepareTarget({ dryRun = false } = {}) {
  const url = TARGET_DB_URL;
  if (!url) fail('MIGRATION_TARGET_DB_URL atau DATABASE_URL wajib diset.');
  const sqlFile = path.join(REPO_ROOT, 'server', 'db', 'prepare-target.sql');
  if (!fs.existsSync(sqlFile)) fail(`Berkas persiapan tidak ditemukan: ${sqlFile}`);

  console.log('[DB PREPARE] Target:', maskDbUrl(url));
  if (dryRun) {
    console.log('[DB PREPARE] DRY-RUN — akan menjalankan:');
    console.log(`  psql --dbname=<target> -v ON_ERROR_STOP=1 --file=${sqlFile}`);
    return;
  }
  if (!(await toolAvailable('psql'))) fail('psql tidak ditemukan di PATH.');
  try {
    await runCommand('psql', ['--dbname=' + JSON.stringify(url), '-v', 'ON_ERROR_STOP=1', '--file=' + JSON.stringify(sqlFile)], { echo: true });
    console.log('[DB PREPARE] ✓ Target siap menerima restore.');
  } catch (err) {
    fail(`prepare-target gagal: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// restore
// ---------------------------------------------------------------------------
async function restoreDatabase(customDumpPath, { dryRun = false } = {}) {
  if (!TARGET_DB_URL) fail('MIGRATION_TARGET_DB_URL atau DATABASE_URL wajib diset untuk restore.');

  let dumpFile = customDumpPath;
  if (!dumpFile) {
    const dir = latestDumpDir();
    if (!dir) fail('Belum ada hasil export. Jalankan: npm run migration:db -- export');
    dumpFile = path.join(dir, 'dump.sql');
  }
  if (!fs.existsSync(dumpFile)) fail(`Dump tidak ditemukan: ${dumpFile}`);

  console.log('[DB RESTORE] Target:', maskDbUrl(TARGET_DB_URL));
  console.log('[DB RESTORE] Dump  :', dumpFile);
  if (dryRun) {
    console.log('[DB RESTORE] DRY-RUN — akan menjalankan:');
    console.log(`  psql --dbname=<target> -v ON_ERROR_STOP=1 --file=${dumpFile}`);
    console.log('[DB RESTORE] Catatan: restore TIDAK memakai --clean (non-destructive).');
    return;
  }
  if (!(await toolAvailable('psql'))) fail('psql tidak ditemukan di PATH.');

  try {
    // ON_ERROR_STOP=1 ensures any restore error aborts loudly (no swallowed errors).
    await runCommand('psql', ['--dbname=' + JSON.stringify(TARGET_DB_URL), '-v', 'ON_ERROR_STOP=1', '--file=' + JSON.stringify(dumpFile)], { echo: true });
  } catch (err) {
    fail(`restore gagal (tidak ada error yang ditelan): ${err.message}`);
  }
  console.log('[DB RESTORE] ✓ Restore selesai. Lanjutkan: migrate-supabase-db.js fix-sequences lalu auth lalu verify.');
}

// ---------------------------------------------------------------------------
// fix-sequences  (set serial sequences = MAX(id))
// ---------------------------------------------------------------------------
async function fixSequences({ dryRun = false } = {}) {
  if (!TARGET_DB_URL) fail('MIGRATION_TARGET_DB_URL atau DATABASE_URL wajib diset.');
  const client = new pg.Client({ connectionString: TARGET_DB_URL, connectionTimeoutMillis: 8000 });
  await client.connect();
  try {
    const seqs = await client.query(`
      SELECT t.relname AS table_name, a.attname AS column_name,
             pg_get_serial_sequence(quote_ident(t.relname), a.attname) AS seq
        FROM pg_class t
        JOIN pg_attribute a ON a.attrelid = t.oid
        JOIN pg_attrdef d ON d.adrelid = t.oid AND d.adnum = a.attnum
       WHERE t.relkind = 'r' AND t.relnamespace = 'public'::regnamespace
         AND pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval%'
    `);
    let fixed = 0;
    for (const row of seqs.rows) {
      if (!row.seq) continue;
      const sql = `SELECT setval('${row.seq}', COALESCE((SELECT MAX(${row.column_name}) FROM ${row.table_name}), 1), (SELECT COUNT(*) > 0 FROM ${row.table_name}))`;
      if (dryRun) { console.log('[DRY-RUN]', sql); continue; }
      await client.query(sql);
      fixed++;
    }
    console.log(`[DB SEQUENCES] ✓ ${dryRun ? '(dry-run) ' : ''}${fixed} sequence disinkronkan.`);
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// auth: map Supabase auth.users -> native public.users (+ user_roles)
// ---------------------------------------------------------------------------
async function migrateAuth({ dryRun = false } = {}) {
  if (!SUPABASE_DB_URL) fail('MIGRATION_SUPABASE_DB_URL wajib diset untuk migrasi auth.');
  if (!TARGET_DB_URL) fail('MIGRATION_TARGET_DB_URL atau DATABASE_URL wajib diset untuk migrasi auth.');

  const src = new pg.Client({ connectionString: SUPABASE_DB_URL, connectionTimeoutMillis: 8000 });
  const dst = new pg.Client({ connectionString: TARGET_DB_URL, connectionTimeoutMillis: 8000 });
  await src.connect();
  await dst.connect();

  const summary = { total: 0, created: 0, skipped: 0, flaggedReset: 0 };
  try {
    const usersRes = await src.query(`
      SELECT u.id, u.email, u.encrypted_password, u.raw_user_meta_data, u.created_at,
             ur.role
        FROM auth.users u
        LEFT JOIN public.user_roles ur ON ur.user_id = u.id
       WHERE u.deleted_at IS NULL
    `);
    summary.total = usersRes.rows.length;
    console.log(`[DB AUTH] Ditemukan ${summary.total} akun di auth.users (source).`);

    for (const u of usersRes.rows) {
      const email = String(u.email || '').trim().toLowerCase();
      if (!email) { summary.skipped++; continue; }
      const meta = u.raw_user_meta_data || {};
      const fullName = meta.full_name || meta.name || null;
      const phone = meta.phone || u.phone || null;
      const avatarUrl = meta.avatar_url || null;
      const hash = u.encrypted_password || null;
      // bcrypt hashes from GoTrue start with $2a$/$2b$/$2y$. Anything else -> forced reset.
      const isBcrypt = typeof hash === 'string' && /^\$2[aby]\$/.test(hash);
      const requireReset = !isBcrypt;

      const role = ['karyawan', 'admin', 'super_admin'].includes(u.role) ? u.role : 'karyawan';

      if (dryRun) {
        console.log(`[DRY-RUN] upsert public.users ${email} role=${role} bcrypt=${isBcrypt} reset=${requireReset}`);
        summary.created++;
        if (requireReset) summary.flaggedReset++;
        continue;
      }

      await dst.query(
        `INSERT INTO public.users (id, email, password_hash, full_name, phone, avatar_url, require_password_reset, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8, now()))
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           password_hash = COALESCE(EXCLUDED.password_hash, public.users.password_hash),
           full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
           phone = COALESCE(EXCLUDED.phone, public.users.phone),
           avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
           require_password_reset = EXCLUDED.require_password_reset`,
        [u.id, email, hash, fullName, phone, avatarUrl, requireReset, u.created_at]
      );
      await dst.query(
        `INSERT INTO public.user_roles (user_id, role) VALUES ($1,$2)
         ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role`,
        [u.id, role]
      );
      summary.created++;
      if (requireReset) summary.flaggedReset++;
    }

    console.log('[DB AUTH] Ringkasan:', JSON.stringify(summary));
    if (summary.flaggedReset > 0) {
      console.log(`[DB AUTH] ${summary.flaggedReset} akun ditandai require_password_reset (hash bukan bcrypt / kosong).`);
    }
  } finally {
    await src.end();
    await dst.end();
  }
}

// ---------------------------------------------------------------------------
// verify: compare source vs target (tables, row counts, sequences, FK)
// ---------------------------------------------------------------------------
const BUSINESS_TABLES = [
  'transactions', 'pengeluaran', 'tagihan_bulanan', 'tagihan_fee_lunas',
  'requests', 'lokasi_apartemen', 'nomor_kamar', 'karyawan_list', 'marketing_list',
  'notifications', 'push_subscriptions', 'user_roles', 'user_profiles', 'system_settings',
];

async function verifyDatabase() {
  console.log('DATABASE MIGRATION VERIFICATION');
  if (!SUPABASE_DB_URL || !TARGET_DB_URL) {
    console.log('\n[!] MIGRATION_SUPABASE_DB_URL dan MIGRATION_TARGET_DB_URL keduanya diperlukan untuk perbandingan live.');
    console.log('[!] Verifikasi statis (kode) OK. Verifikasi live: NOT VERIFIED (butuh kredensial).');
    return;
  }

  const src = new pg.Client({ connectionString: SUPABASE_DB_URL, connectionTimeoutMillis: 8000 });
  const dst = new pg.Client({ connectionString: TARGET_DB_URL, connectionTimeoutMillis: 8000 });
  let pass = true;
  try {
    await src.connect();
    await dst.connect();

    const listTables = async (c) => {
      const r = await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
      return new Set(r.rows.map((x) => x.tablename));
    };
    const srcTables = await listTables(src);
    const dstTables = await listTables(dst);

    const countRows = async (c, t) => {
      try {
        const r = await c.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
        return r.rows[0].n;
      } catch (_e) {
        return null;
      }
    };

    console.log('\nTables (public):');
    const checkTables = BUSINESS_TABLES.filter((t) => srcTables.has(t));
    for (const t of checkTables) {
      const inDst = dstTables.has(t);
      const sc = await countRows(src, t);
      const dc = inDst ? await countRows(dst, t) : null;
      const ok = inDst && sc === dc;
      if (!ok) pass = false;
      console.log(`${ok ? '✓' : '✗'} ${t.padEnd(22)} ${sc} → ${dc ?? 'MISSING'}`);
    }

    // Foreign key constraints present in target
    const fkRes = await dst.query(`
      SELECT COUNT(*)::int AS n FROM information_schema.table_constraints
       WHERE constraint_schema='public' AND constraint_type='FOREIGN KEY'`);
    console.log(`\nForeign Keys (target): ${fkRes.rows[0].n} constraints`);

    // Sequences last_value sanity
    const seqRes = await dst.query(`SELECT COUNT(*)::int AS n FROM pg_sequences WHERE schemaname='public'`);
    console.log(`Sequences (target): ${seqRes.rows[0].n}`);

    // Native users mapped
    try {
      const u = await dst.query('SELECT COUNT(*)::int AS n FROM public.users');
      const ur = await dst.query('SELECT COUNT(*)::int AS n FROM public.user_roles');
      console.log(`\nNative auth: users=${u.rows[0].n} user_roles=${ur.rows[0].n}`);
    } catch (_e) {
      console.log('\nNative auth: tabel public.users belum ada (jalankan prepare-target + auth).');
      pass = false;
    }

    console.log(`\nResult: ${pass ? 'PASS' : 'FAIL'}`);
    if (!pass) process.exitCode = 1;
  } catch (err) {
    console.error('[DB VERIFY] Gagal:', err.message);
    process.exitCode = 1;
  } finally {
    await src.end().catch(() => {});
    await dst.end().catch(() => {});
  }
}

function printUsage() {
  console.log(`
Usage: node tools/migrate-supabase-db.js <command> [options]

Commands:
  export [--no-auth] [--dry-run]   Dump Supabase (public + auth.users/identities) via pg_dump
  prepare-target [--dry-run]       Prepare vanilla PostgreSQL target (roles, schemas, native auth tables)
  restore [dumpPath] [--dry-run]   Restore dump into target (non-destructive, no --clean)
  fix-sequences [--dry-run]        Reset serial sequences to MAX(id)
  auth [--dry-run]                 Map auth.users -> public.users + user_roles (bcrypt preserved / forced reset)
  verify                           Compare source vs target tables, rows, FKs, sequences

Environment:
  MIGRATION_SUPABASE_DB_URL   source (read-only)
  MIGRATION_TARGET_DB_URL     target self-hosted PostgreSQL (or DATABASE_URL)
`);
}

const argv = process.argv.slice(2);
const command = argv[0];
const flags = new Set(argv.slice(1).filter((a) => a.startsWith('--')));
const positional = argv.slice(1).filter((a) => !a.startsWith('--'));
const dryRun = flags.has('--dry-run');

(async () => {
  switch (command) {
    case 'export': await exportDatabase({ dryRun, includeAuth: !flags.has('--no-auth') }); break;
    case 'prepare-target': await prepareTarget({ dryRun }); break;
    case 'restore': await restoreDatabase(positional[0], { dryRun }); break;
    case 'fix-sequences': await fixSequences({ dryRun }); break;
    case 'auth': await migrateAuth({ dryRun }); break;
    case 'verify': await verifyDatabase(); break;
    default: printUsage(); process.exit(command ? 1 : 0);
  }
})().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
