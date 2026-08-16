/**
 * @file s3.provider.js
 * @description Generic S3-compatible storage provider (AWS S3, MinIO, Backblaze B2, etc.).
 *
 * Required env vars:
 *   S3_ENDPOINT          — Full endpoint URL (e.g. https://s3.amazonaws.com)
 *   S3_REGION            — AWS region (e.g. us-east-1)
 *   S3_ACCESS_KEY_ID     — Access key ID
 *   S3_SECRET_ACCESS_KEY — Secret access key
 *   S3_BUCKET_NAME       — Target bucket
 *   S3_PUBLIC_URL        — Public base URL (optional; falls back to endpoint+bucket)
 *
 * Implements the StorageProvider interface.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import path from 'path';
import crypto from 'crypto';
import { NotFoundError } from '../../../middleware/errorHandler.js';

/**
 * Strip path traversals and dangerous characters from a storage path.
 *
 * @param {string} raw
 * @returns {string}
 */
function sanitisePath(raw) {
  const clean = raw.replace(/\0/g, '').replace(/\\/g, '/');
  const parts = clean.split('/').filter((p) => p !== '' && p !== '.');
  const safe  = [];
  for (const part of parts) {
    if (part === '..') safe.pop();
    else safe.push(part);
  }
  return safe.join('/');
}

/**
 * Build a unique object key: `{folder}/{name}-{timestamp}-{rand4}.{ext}`
 *
 * @param {string} folder
 * @param {string} original
 * @returns {string}
 */
function buildKey(folder, original) {
  const ext  = path.extname(original).toLowerCase();
  const base = path.basename(original, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  const rand = crypto.randomBytes(4).toString('hex');
  return `${sanitisePath(folder)}/${base}-${Date.now()}-${rand}${ext}`;
}

export class S3Provider {
  constructor() {
    this._bucket    = process.env.S3_BUCKET_NAME;
    this._publicUrl = (process.env.S3_PUBLIC_URL || '').replace(/\/$/, '');

    if (!this._bucket) throw new Error('S3_BUCKET_NAME is required for the S3 storage provider');

    const endpoint = process.env.S3_ENDPOINT;
    const region   = process.env.S3_REGION || 'us-east-1';

    const clientConfig = {
      region,
      credentials: {
        accessKeyId:     process.env.S3_ACCESS_KEY_ID     || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      },
    };

    if (endpoint) {
      clientConfig.endpoint              = endpoint;
      clientConfig.forcePathStyle        = true; // required for MinIO and other non-AWS endpoints
    }

    this._client = new S3Client(clientConfig);

    // Derive a fallback public URL if none provided
    if (!this._publicUrl && endpoint) {
      this._publicUrl = `${endpoint.replace(/\/$/, '')}/${this._bucket}`;
    }
  }

  /**
   * Upload a buffer to S3.
   *
   * @param {Buffer} buffer
   * @param {string} folder
   * @param {string} originalName
   * @param {string} contentType
   * @returns {Promise<{ url: string, pathname: string, access: string }>}
   */
  async upload(buffer, folder, originalName, contentType) {
    const key = buildKey(folder, originalName);

    await this._client.send(new PutObjectCommand({
      Bucket:      this._bucket,
      Key:         key,
      Body:        buffer,
      ContentType: contentType || 'application/octet-stream',
    }));

    return {
      url:      this.resolveUrl(key),
      pathname: key,
      access:   'public',
    };
  }

  /**
   * Stream a file from S3.
   *
   * @param {string} pathname
   * @returns {Promise<{ stream: NodeJS.ReadableStream, contentType: string }>}
   */
  async getFile(pathname) {
    const key = sanitisePath(pathname);
    let response;

    try {
      response = await this._client.send(new GetObjectCommand({
        Bucket: this._bucket,
        Key:    key,
      }));
    } catch (err) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        throw new NotFoundError(`File not found: ${pathname}`);
      }
      throw err;
    }

    return {
      stream:      response.Body,
      contentType: response.ContentType || 'application/octet-stream',
    };
  }

  /**
   * Delete an object from S3. Idempotent.
   *
   * @param {string} pathname
   * @returns {Promise<void>}
   */
  async delete(pathname) {
    const key = sanitisePath(pathname);
    await this._client.send(new DeleteObjectCommand({
      Bucket: this._bucket,
      Key:    key,
    }));
  }

  /**
   * List objects with the given prefix.
   *
   * @param {string} prefix
   * @returns {Promise<Array<{ pathname: string, createdAt: Date }>>}
   */
  async list(prefix) {
    const safePrefix = sanitisePath(prefix);
    const results    = [];
    let continuationToken;

    do {
      const response = await this._client.send(new ListObjectsV2Command({
        Bucket:            this._bucket,
        Prefix:            safePrefix,
        ContinuationToken: continuationToken,
      }));

      for (const obj of response.Contents || []) {
        results.push({ pathname: obj.Key, createdAt: obj.LastModified });
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return results;
  }

  /**
   * Return the public URL for a stored object.
   *
   * @param {string} pathname
   * @returns {string}
   */
  resolveUrl(pathname) {
    return `${this._publicUrl}/${pathname}`;
  }
}
