/* eslint-env node */
/* global process, Buffer */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { sanitizeStorageKey } from './local.js';

/**
 * Generic S3-compatible driver.
 * Cloudflare R2 works through this same driver via configuration:
 *   STORAGE_DRIVER=s3 (or alias 'r2')
 *   S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
 *   S3_REGION=auto
 * No provider-specific code paths.
 */
export class S3StorageDriver {
  constructor(config = {}) {
    this.bucket = config.bucket || process.env.S3_BUCKET;
    this.endpoint = config.endpoint || process.env.S3_ENDPOINT;
    this.region = config.region || process.env.S3_REGION || 'auto';
    this.publicDomain = config.publicDomain || process.env.S3_PUBLIC_DOMAIN;

    if (!this.bucket) {
      throw new Error('S3StorageDriver: S3_BUCKET wajib diset.');
    }

    this.client = new S3Client({
      endpoint: this.endpoint || undefined,
      region: this.region,
      credentials: {
        accessKeyId: config.accessKeyId || process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: config.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: Boolean(this.endpoint),
    });
  }

  async upload(key, buffer, options = {}) {
    const safeKey = sanitizeStorageKey(key);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: safeKey,
      Body: buffer,
      ContentType: options.contentType || 'application/octet-stream',
    });
    await this.client.send(command);
    return { key: safeKey, url: this.getUrl(safeKey), size: buffer.length, contentType: options.contentType || null };
  }

  async get(key) {
    const safeKey = sanitizeStorageKey(key);
    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: safeKey });
      const res = await this.client.send(command);
      const chunks = [];
      for await (const chunk of res.Body) chunks.push(chunk);
      return Buffer.concat(chunks);
    } catch (err) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async exists(key) {
    const safeKey = sanitizeStorageKey(key);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: safeKey }));
      return true;
    } catch (err) {
      if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return false;
      throw err;
    }
  }

  async stat(key) {
    const safeKey = sanitizeStorageKey(key);
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: safeKey }));
      return { size: res.ContentLength, contentType: res.ContentType, lastModified: res.LastModified };
    } catch (err) {
      if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async delete(key) {
    const safeKey = sanitizeStorageKey(key);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey }));
      return true;
    } catch (_err) {
      return false;
    }
  }

  getUrl(key) {
    const safeKey = sanitizeStorageKey(key);
    if (this.publicDomain) {
      return `${this.publicDomain.replace(/\/+$/, '')}/${safeKey}`;
    }
    // No public domain configured -> objects are served through the
    // authenticated application proxy (never expose bucket internals).
    return `/api/blob?pathname=${encodeURIComponent(safeKey)}`;
  }
}
