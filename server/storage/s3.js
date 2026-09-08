/* eslint-env node */
/* global process */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { sanitizeStorageKey } from './local.js';

export class S3StorageDriver {
  constructor(config = {}) {
    this.bucket = config.bucket || process.env.S3_BUCKET;
    this.endpoint = config.endpoint || process.env.S3_ENDPOINT;
    this.region = config.region || process.env.S3_REGION || 'auto';
    this.publicDomain = config.publicDomain || process.env.S3_PUBLIC_DOMAIN;

    this.client = new S3Client({
      endpoint: this.endpoint || undefined,
      region: this.region,
      credentials: {
        accessKeyId: config.accessKeyId || process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: config.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: true,
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
    return { key: safeKey, url: this.getUrl(safeKey) };
  }

  async get(key) {
    const safeKey = sanitizeStorageKey(key);
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: safeKey,
      });
      const res = await this.client.send(command);
      const chunks = [];
      for await (const chunk of res.Body) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (err) {
      if (err.name === 'NoSuchKey') return null;
      throw err;
    }
  }

  async exists(key) {
    const safeKey = sanitizeStorageKey(key);
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: safeKey,
      });
      await this.client.send(command);
      return true;
    } catch (err) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  async delete(key) {
    const safeKey = sanitizeStorageKey(key);
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: safeKey,
      });
      await this.client.send(command);
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
    return `/api/storage/${safeKey}`;
  }
}
