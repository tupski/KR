/**
 * @file storageUrl.js
 * @description Resolve stored file values to fully-qualified URLs.
 * Supports legacy Vercel Blob proxy, new backend storage proxy, and external URLs.
 */

import { resolveFileUrl } from '@/api/storage.api';

/**
 * Resolve a stored file value to a fully-qualified URL.
 * Delegates to src/api/storage.api.js for the actual logic.
 *
 * Rules:
 *  - null/undefined                → return as-is
 *  - /api/blob?pathname=...        → convert legacy proxy to new storage URL
 *  - .../api/storage/file/...      → already resolved, return as-is
 *  - private Vercel Blob hostname  → proxy via backend /api/storage/file/
 *  - any other full URL            → return as-is (public CDN, etc.)
 *  - bare relative path            → treat as storage pathname
 *
 * @param {string|null|undefined} value
 * @returns {string|null|undefined}
 */
export const resolveStorageUrl = resolveFileUrl;

export default resolveStorageUrl;
