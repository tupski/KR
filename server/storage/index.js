/* eslint-env node */
/* global process */

import { LocalStorageDriver, sanitizeStorageKey, toCanonicalKey } from './local.js';
import { S3StorageDriver } from './s3.js';

let storageInstance = null;

export function getStorageDriver() {
  if (storageInstance) return storageInstance;

  const driverType = (process.env.STORAGE_DRIVER || 'local').toLowerCase();

  if (driverType === 's3' || driverType === 'r2') {
    storageInstance = new S3StorageDriver();
  } else {
    storageInstance = new LocalStorageDriver();
  }

  return storageInstance;
}

export function resolveStorageReference(value) {
  if (!value || typeof value !== 'string') return value;
  const canonicalKey = toCanonicalKey(value);
  const driver = getStorageDriver();
  return driver.getUrl(canonicalKey);
}

export { sanitizeStorageKey, toCanonicalKey };
