import { IS_SELF_HOST, API_BASE } from './config';
import { upload } from './apiClient';

export const uploadToVercelBlob = async (file, folder = 'uploads') => {
  if (!file) return null;

  if (IS_SELF_HOST) {
    const path = `${folder}/${Date.now()}-${String(file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { data, error, key } = await upload(path, file, folder);
    if (error) throw new Error(error.message || 'Gagal upload ke storage self-host.');
    // url = full proxy/public URL → resolveStorageUrl melempar langsung.
    return data || key;
  }

  const safeName = `${Date.now()}-${String(file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const headers = {
    'Content-Type': file.type || 'application/octet-stream',
    'x-file-name': safeName,
    'x-folder': folder,
  };

  const response = await fetch('/api/upload', {
    method: 'POST',
    headers,
    body: file,
  });

  if (!response.ok) {
    let message = 'Gagal upload ke Vercel Blob.';
    try {
      const err = await response.json();
      message = err?.error || err?.message || message;
    } catch (_e) {
      // Kosong: fallback pakai message default
    }
    throw new Error(message);
  }

  const data = await response.json();
  if (!data?.url) {
    throw new Error('URL file dari Vercel Blob tidak ditemukan.');
  }
  return data.url;
};

// Re-export uploadFile alias (phase_04 storageUpload contract)
export const uploadFile = uploadToVercelBlob;
