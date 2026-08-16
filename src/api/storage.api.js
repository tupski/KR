/**
 * @file storage.api.js
 * @description Storage API — file upload and URL resolution.
 * Replaces src/lib/vercelBlobUpload.js and src/lib/storageUrl.js logic.
 */

import { tokenStorage, BASE_URL } from './client.js';

/**
 * Upload a file to /api/storage/upload.
 * Sends the raw file body with x-file-name and x-folder headers.
 *
 * @param {File} file
 * @param {string} [folder='uploads']
 * @returns {Promise<string>} Public URL of the uploaded file
 */
export async function uploadFile(file, folder = 'uploads') {
  const token = tokenStorage.getToken();

  const res = await fetch(`${BASE_URL}/api/storage/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'x-file-name': encodeURIComponent(file.name),
      'x-folder': encodeURIComponent(folder),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: file,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Upload failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  // Server returns { url } or { pathname }
  return data.url || `${BASE_URL}/api/storage/file/${data.pathname}`;
}

/**
 * Resolve a stored file value to a fully-qualified URL.
 *
 * Rules:
 *  - null/undefined   → return as-is
 *  - /api/blob?...    → convert legacy proxy path to new storage URL
 *  - contains /api/storage/file/ → already resolved, return as-is
 *  - private Vercel blob URL     → proxy via new storage endpoint
 *  - any other full URL          → return as-is (public CDN, etc.)
 *  - relative path               → treat as storage pathname
 *
 * @param {string|null|undefined} value
 * @returns {string|null|undefined}
 */
export function resolveFileUrl(value) {
  if (!value) return value;

  // Legacy internal proxy: /api/blob?pathname=...
  if (value.startsWith('/api/blob')) {
    try {
      const url = new URL(value, window.location.origin);
      const pathname = url.searchParams.get('pathname');
      return pathname
        ? `${BASE_URL}/api/storage/file/${pathname}`
        : value;
    } catch {
      return value;
    }
  }

  // Already using the new storage proxy
  if (value.includes('/api/storage/file/')) return value;

  // Try to parse as full URL
  try {
    const parsed = new URL(value);
    // Private Vercel Blob — must be proxied through backend
    if (parsed.hostname.endsWith('.private.blob.vercel-storage.com')) {
      const pathname = parsed.pathname.replace(/^\/+/, '');
      return `${BASE_URL}/api/storage/file/${pathname}`;
    }
    // Any other full URL (public CDN, external image, etc.) → return as-is
    return value;
  } catch {
    // Not a full URL — treat as a storage pathname
    return `${BASE_URL}/api/storage/file/${value}`;
  }
}
