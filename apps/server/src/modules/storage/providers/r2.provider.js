/**
 * @file r2.provider.js
 * @description Cloudflare R2 storage provider via the AWS SDK S3-compatible API.
 *
 * Required env vars:
 *   R2_ACCOUNT_ID         — Cloudflare account ID
 *   R2_ACCESS_KEY_ID      — R2 API token key ID
 *   R2_SECRET_ACCESS_KEY  — R2 API token secret
 *   R2_BUCKET_NAME        — Target bucket name
 *   R2_PUBLIC_URL         — Public base URL (e.g. https://pub.example.com)
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
 * Sanitise a relative storage path (strips `..`, leading slashes, null bytes).
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

export class R2Provider {
  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    if (!accountId) throw new Error('R2_ACCOUNT_ID is required for the R2 storage provider');

    this._bucket    = process.env.R2_BUCKET_NAME;
    this._publicUrl = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

    if (!this._bucket) throw new Error('R2_BUCKET_NAME is required for the R2 storage provider');

    this._client = new S3Client({
      region:   'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:     process.env.R2_ACCESS_KEY_ID     || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
    });
  }

  /**
   * Upload a buffer to R2.
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
   * Stream a file from R2.
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
   * Delete an object from R2. Idempotent.
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
