#!/usr/bin/env node
/**
 * @file bootstrap-admin.js
 * @description Script to create a super admin user for Kakarama Room.
 * Connects directly to PostgreSQL database using the same auth system as the backend.
 * 
 * Usage: node scripts/bootstrap-admin.js
 * 
 * Environment variables required:
 * - DATABASE_URL or (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME)
 * - JWT_SECRET (for token generation)
 */

import readline from 'readline';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import pg from 'pg';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

const { Pool } = pg;

// Create database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Prompt user for input
 * @param {string} question - Question to ask
 * @returns {Promise<string>} User's answer
 */
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Prompt for password with hidden input (basic fallback)
 * @param {string} prompt - Prompt message
 * @returns {Promise<string>} Password entered
 */
async function askPassword(prompt) {
  // Note: On Windows, hiding password requires different handling
  // For simplicity, we'll use regular input but warn the user
  console.log('\n⚠️  Note: Password will be visible in terminal. Run in a private environment.');
  return askQuestion(prompt);
}

/**
 * Generate a UUID v4
 * @returns {string} UUID string
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Check if a user with the given email already exists
 * @param {string} email - Email to check
 * @returns {Promise<object|null>} Existing user or null
 */
async function findUserByEmail(email) {
  const result = await pool.query(
    'SELECT id, email, role FROM users WHERE email = $1 LIMIT 1',
    [email.toLowerCase()]
  );
  return result.rows[0] ?? null;
}

/**
 * Create a new user with the given details
 * @param {object} params - User details
 * @returns {Promise<object>} Created user
 */
async function createUser({ email, password, role, displayName }) {
  const id = generateUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();

  await pool.query(
    `INSERT INTO users (id, email, password_hash, role, display_name, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, email.toLowerCase(), passwordHash, role, displayName || null, now, now]
  );

  return { id, email: email.toLowerCase(), role };
}

/**
 * Create user profile if the table exists
 * @param {string} userId - User UUID
 * @param {string} displayName - Display name
 */
async function createUserProfile(userId, displayName) {
  try {
    await pool.query(
      `INSERT INTO user_profiles (id, display_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [userId, displayName || null, new Date(), new Date()]
    );
  } catch (error) {
    // Table might not exist, ignore
    console.log('ℹ️  Note: user_profiles table not updated (may not exist yet)');
  }
}

/**
 * Main function to create super admin
 */
async function createSuperAdmin() {
  let client;
  
  try {
    console.log('\n🏢 Kakarama Room - Super Admin Setup');
    console.log('='.repeat(60));
    console.log('This script will create a super admin account.\n');

    // Test database connection
    client = await pool.connect();
    console.log('✅ Database connection established\n');

    // Get email
    const email = await askQuestion('Enter email for Super Admin: ');
    if (!email || !email.includes('@')) {
      console.log('❌ Error: Please enter a valid email address');
      rl.close();
      client.release();
      process.exit(1);
    }

    // Check if user already exists
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      console.log(`\n⚠️  A user with email "${email}" already exists.`);
      console.log(`   Role: ${existingUser.role}`);
      console.log(`   ID: ${existingUser.id}`);
      
      const updateRole = await askQuestion('Do you want to update their role to super_admin? (y/n): ');
      if (updateRole.toLowerCase() === 'y') {
        await pool.query(
          'UPDATE users SET role = $1, updated_at = $2 WHERE id = $3',
          ['super_admin', new Date(), existingUser.id]
        );
        console.log('\n✅ User role updated to super_admin successfully!');
        console.log(`📧 Email: ${existingUser.email}`);
        console.log(`🔑 User ID: ${existingUser.id}`);
      } else {
        console.log('\nℹ️  Operation cancelled.');
      }
      rl.close();
      client.release();
      process.exit(0);
    }

    // Get password
    const password = await askPassword('Enter password (min 6 characters): ');
    if (!password || password.length < 6) {
      console.log('\n❌ Error: Password must be at least 6 characters');
      rl.close();
      client.release();
      process.exit(1);
    }

    // Confirm password
    const confirmPassword = await askPassword('Confirm password: ');
    if (password !== confirmPassword) {
      console.log('\n❌ Error: Passwords do not match');
      rl.close();
      client.release();
      process.exit(1);
    }

    // Get display name (optional)
    const displayName = await askQuestion('Enter display name (optional, press Enter to skip): ');

    console.log('\n⏳ Creating super admin account...');

    // Create the user
    const user = await createUser({
      email,
      password,
      role: 'super_admin',
      displayName: displayName || null,
    });

    // Try to create user profile
    await createUserProfile(user.id, displayName);

    console.log('\n✅ Super Admin account created successfully!');
    console.log('─'.repeat(40));
    console.log(`📧 Email: ${user.email}`);
    console.log(`🔑 User ID: ${user.id}`);
    console.log(`👤 Role: ${user.role}`);
    if (displayName) {
      console.log(`📛 Display Name: ${displayName}`);
    }
    console.log('─'.repeat(40));
    console.log('\n🔐 You can now log in with these credentials.');
    console.log('⚠️  Please keep your password secure!');

    // Log activity if activity_logs table exists
    try {
      await pool.query(
        `INSERT INTO activity_logs (user_id, action, details, created_at)
         VALUES ($1, $2, $3, $4)`,
        [user.id, 'Bootstrap Admin Created', `Super admin account created via bootstrap script`, new Date()]
      );
    } catch (logError) {
      // Ignore if activity_logs table doesn't exist
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    rl.close();
    if (client) client.release();
    await pool.end();
  }
}

// Run the script
createSuperAdmin().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
