#!/usr/bin/env node
/* eslint-env node */
/* global process, Buffer */

import http from 'http';

// Create a simple 1x1 PNG image
const pngBytes = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1,
  13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
]);

async function testUpload(port, label) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: port,
      path: '/api/upload',
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        'x-file-name': 'test.png',
        'x-folder': 'test-uploads',
        'Content-Length': pngBytes.length,
      },
    };

    console.log(`\n[${label}] Testing upload to http://localhost:${port}/api/upload`);
    console.log(`[${label}] File size: ${pngBytes.length} bytes`);

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`[${label}] Status Code: ${res.statusCode}`);
        console.log(`[${label}] Response Headers:`, res.headers);
        console.log(`[${label}] Response Body:`, data);
        resolve({ statusCode: res.statusCode, body: data });
      });
    });

    req.on('error', (error) => {
      console.error(`[${label}] Error:`, error.message);
      resolve({ error: error.message });
    });

    req.write(pngBytes);
    req.end();
  });
}

async function main() {
  console.log('=== Upload Flow Verification ===\n');

  // Test direct API
  console.log('1. Testing direct API call (port 3001)...');
  const apiResult = await testUpload(3001, 'API');

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test through Vite proxy
  console.log('\n2. Testing through Vite proxy (port 5173)...');
  const proxyResult = await testUpload(5173, 'PROXY');

  // Summary
  console.log('\n=== Summary ===');
  console.log('Direct API (3001):', apiResult.statusCode ? `✓ ${apiResult.statusCode}` : `✗ ${apiResult.error}`);
  console.log('Vite Proxy (5173):', proxyResult.statusCode ? `✓ ${proxyResult.statusCode}` : `✗ ${proxyResult.error}`);

  process.exit(0);
}

main().catch(console.error);
