/* eslint-env node */
/* global process */
import 'dotenv/config.js';
import express from 'express';
import uploadHandler from './upload.js';
import blobHandler from './blob.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));
app.use(express.raw({ type: 'image/*', limit: '50mb' }));
app.use(express.raw({ type: 'application/pdf', limit: '50mb' }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-file-name, x-folder');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  next();
});

// Routes
app.post('/api/upload', uploadHandler);
app.delete('/api/upload', uploadHandler);
app.get('/api/blob', blobHandler);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route tidak ditemukan.' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[dev-server] Error:', err);
  res.status(500).json({ error: err?.message || 'Terjadi kesalahan pada server.' });
});

// Start server
app.listen(PORT, () => {
  console.log(`[dev-server] API server running on http://localhost:${PORT}`);
  console.log(`[dev-server] Available routes:`);
  console.log(`  POST   /api/upload`);
  console.log(`  DELETE /api/upload`);
  console.log(`  GET    /api/blob`);
  console.log(`  GET    /health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[dev-server] SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[dev-server] SIGINT received, shutting down gracefully...');
  process.exit(0);
});
