/**
 * @file vercelBlobUpload.js
 * @description Backward-compatible wrapper — components that call
 * `uploadToVercelBlob()` continue to work without modification.
 * The actual upload now goes to the new backend storage endpoint.
 */

import { uploadFile } from '@/api/storage.api';

/**
 * Upload a file to backend storage.
 * Drop-in replacement for the old Vercel Blob upload.
 *
 * @param {File} file
 * @param {string} [folder='uploads']
 * @returns {Promise<string>} URL of the uploaded file
 */
export const uploadToVercelBlob = (file, folder = 'uploads') =>
  uploadFile(file, folder);

export default uploadToVercelBlob;
