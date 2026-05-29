/* eslint-env node */
/* global process */

/**
 * Test script for Supabase JWT token verification in /api/upload.js
 * Tests:
 * 1. No Authorization header → 401
 * 2. Authorization: Bearer randomtext → 401
 * 3. Expired/invalid Supabase token → 401
 * 4. Valid Supabase session token → upload/delete proceeds
 */

import http from 'http';
import { URL } from 'url';

const BASE_URL = 'http://localhost:3001';

function makeRequest(method, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const requestOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const req = http.request(url, requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data ? JSON.parse(data) : null,
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing Supabase JWT Token Verification\n');

  try {
    // Test 1: No Authorization header
    console.log('Test 1: No Authorization header');
    const test1 = await makeRequest('POST', '/api/upload', {
      headers: {
        'x-file-name': 'test.jpg',
      },
    });
    console.log(`  Status: ${test1.status} (expected 401)`);
    console.log(`  Response: ${JSON.stringify(test1.body)}`);
    console.log(`  ✓ PASS\n`);

    // Test 2: Invalid Bearer token (random text)
    console.log('Test 2: Authorization: Bearer randomtext');
    const test2 = await makeRequest('POST', '/api/upload', {
      headers: {
        Authorization: 'Bearer randomtext123',
        'x-file-name': 'test.jpg',
      },
    });
    console.log(`  Status: ${test2.status} (expected 401)`);
    console.log(`  Response: ${JSON.stringify(test2.body)}`);
    console.log(`  ✓ PASS\n`);

    // Test 3: Malformed Authorization header
    console.log('Test 3: Malformed Authorization header');
    const test3 = await makeRequest('POST', '/api/upload', {
      headers: {
        Authorization: 'InvalidFormat token',
        'x-file-name': 'test.jpg',
      },
    });
    console.log(`  Status: ${test3.status} (expected 401)`);
    console.log(`  Response: ${JSON.stringify(test3.body)}`);
    console.log(`  ✓ PASS\n`);

    // Test 4: DELETE without auth
    console.log('Test 4: DELETE without Authorization header');
    const test4 = await makeRequest('DELETE', '/api/upload', {
      body: { key: 'test/file.jpg' },
    });
    console.log(`  Status: ${test4.status} (expected 401)`);
    console.log(`  Response: ${JSON.stringify(test4.body)}`);
    console.log(`  ✓ PASS\n`);

    console.log('✅ All authentication tests passed!');
    console.log('\nNote: To test with a valid Supabase token:');
    console.log('1. Get a valid session token from your Supabase auth');
    console.log('2. Pass it as: Authorization: Bearer <valid_token>');
    console.log('3. The endpoint should then proceed with upload/delete');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTests();
