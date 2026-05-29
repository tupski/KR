/* eslint-env node */
/* global process, Buffer */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
];

function getS3Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;
  const region = process.env.R2_REGION || 'auto';

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials not configured');
  }

  return new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

const readRequestBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-file-name, x-folder');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }

  try {
    const rawName = req.headers['x-file-name'] || `file-${Date.now()}`;
    const folder = (req.headers['x-folder'] || 'uploads').toString().replace(/[^a-zA-Z0-9/_-]/g, '');
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    // Validate content type
    if (!ALLOWED_TYPES.includes(contentType)) {
      return res.status(400).json({
        error: `Tipe file tidak diizinkan: ${contentType}. Allowed: ${ALLOWED_TYPES.join(', ')}`,
      });
    }

    const body = await readRequestBody(req);

    if (!body || body.length === 0) {
      return res.status(400).json({ error: 'File kosong.' });
    }

    if (body.length > MAX_SIZE) {
      return res.status(400).json({ error: 'Ukuran file maksimal 10MB.' });
    }

    const s3 = getS3Client();
    const bucket = process.env.R2_BUCKET || 'artupski-drive';
    const key = `${folder}/${rawName}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );

    const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL || `https://cdn.artupski.com`;
    const url = `${publicBaseUrl.replace(/\/+$/, '')}/${key}`;

    return res.status(200).json({ url, key });
  } catch (error) {
    console.error('[r2-upload] Error:', error);
    return res.status(500).json({
      error: error?.message || 'Gagal upload file ke R2.',
    });
  }
}
