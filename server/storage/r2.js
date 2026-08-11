// Cloudflare R2 adapter — S3-compatible via @aws-sdk/client-s3.
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
  txt: 'text/plain', json: 'application/json',
};

function contentTypeFromName(name) {
  const ext = name.split('.').pop()?.toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

function proxyUrl(key) {
  return `/api/storage/proxy?ref=${Buffer.from(key).toString('base64url')}`;
}

export function create({ config, env }) {
  const bucket = config.bucket;
  if (!bucket) throw new Error('r2.bucket required');
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error('r2 credentials required (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)');
  }
  const client = new S3Client({
    region: config.region || 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  const publicUrl = config.publicUrl?.replace(/\/+$/, '') || '';

  return {
    async put({ buffer, fileName, folder }) {
      const key = [folder, fileName].filter(Boolean).join('/');
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: buffer,
        ContentType: contentTypeFromName(fileName),
      }));
      return { key, url: publicUrl ? `${publicUrl}/${key}` : proxyUrl(key) };
    },

    async get(key) {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return { stream: out.Body, contentType: out.ContentType || 'application/octet-stream' };
    },

    async del(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    proxyUrl,

    async ping() {
      const t0 = Date.now();
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return { ok: true, latencyMs: Date.now() - t0, detail: `bucket=${bucket}` };
    },
  };
}
