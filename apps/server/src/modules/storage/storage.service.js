/**
 * @file storage.service.js
 * @description Thin wrapper around the active storage provider.
 * All modules that need file I/O should import from here rather than
 * calling a provider directly — the provider can be swapped at any time
 * by changing the STORAGE_PROVIDER env var.
 *
 * Exported functions mirror the provider interface:
 *   uploadFile(buffer, folder, filename, contentType) → Promise<{ url, pathname, access }>
 *   getFile(pathname)                                 → Promise<{ stream, contentType }>
 *   deleteFile(pathname)                              → Promise<void>
 *   listFiles(prefix)                                 → Promise<Array<{ pathname, createdAt }>>
 *   resolveUrl(pathname)                              → string  (sync, cached provider call)
 */

import { getStorageProvider } from '../../config/storage.js';

/**
 * Upload a file buffer.
 *
 * @param {Buffer} buffer
 * @param {string} folder        Target folder / prefix (e.g. 'ktp-images')
 * @param {string} filename      Original filename (used to derive extension)
 * @param {string} contentType   MIME type string
 * @returns {Promise<{ url: string, pathname: string, access: string }>}
 */
export async function uploadFile(buffer, folder, filename, contentType) {
  const provider = await getStorageProvider();
  return provider.upload(buffer, folder, filename, contentType);
}

/**
 * Retrieve a stored file as a readable stream.
 *
 * @param {string} pathname  Relative path returned by uploadFile
 * @returns {Promise<{ stream: NodeJS.ReadableStream, contentType: string }>}
 */
export async function getFile(pathname) {
  const provider = await getStorageProvider();
  return provider.getFile(pathname);
}

/**
 * Permanently delete a stored file. Idempotent.
 *
 * @param {string} pathname
 * @returns {Promise<void>}
 */
export async function deleteFile(pathname) {
  const provider = await getStorageProvider();
  return provider.delete(pathname);
}

/**
 * List all stored files under a given prefix.
 *
 * @param {string} prefix  e.g. 'ktp-images/' or 'transfer-proofs/'
 * @returns {Promise<Array<{ pathname: string, createdAt: Date }>>}
 */
export async function listFiles(prefix) {
  const provider = await getStorageProvider();
  return provider.list(prefix);
}

/**
 * Resolve the client-accessible URL for a stored pathname.
 * Note: this is async because it needs to initialise the provider on first call.
 *
 * @param {string} pathname
 * @returns {Promise<string>}
 */
export async function resolveUrl(pathname) {
  const provider = await getStorageProvider();
  return provider.resolveUrl(pathname);
}
