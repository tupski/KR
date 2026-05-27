import { useState, useCallback } from 'react';
import { compressImageFile } from '@/lib/compressImage';
import { uploadToVercelBlob } from '@/lib/vercelBlobUpload';

/**
 * Hook for handling image picking, compression, and upload for transactions.
 *
 * @returns {object} Uploading state, error, and handler functions
 */
export function useTransactionImages() {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  /**
   * Pick a file, compress it, and upload to Vercel Blob.
   * The caller is responsible for setting the resulting URL into formData.
   *
   * @param {string}       field - Field name (used for error context)
   * @param {File|null}    file  - Image file to process
   * @returns {Promise<string|null>} Uploaded URL or null on failure
   */
  const handleImagePick = useCallback(async (field, file) => {
    if (!file) return null;

    setUploading(true);
    setUploadError(null);

    try {
      const compressed = await compressImageFile(file, { maxWidth: 1920, quality: 0.82 });
      const url = await uploadToVercelBlob(compressed, 'transaksi-proof');
      return url;
    } catch (err) {
      const message = err.message || `Gagal upload ${field}`;
      setUploadError(message);
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  /**
   * Clear any upload errors.
   */
  const clearImages = useCallback(() => {
    setUploadError(null);
  }, []);

  return { uploading, uploadError, handleImagePick, clearImages };
}
