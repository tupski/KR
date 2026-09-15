import { supabase } from './customSupabaseClient';

export const uploadToVercelBlob = async (file, folder = 'uploads') => {
  if (!file) return null;

  // Sprint 1 / H-1: endpoint /api/upload kini wajib autentikasi.
  // Folder juga divalidasi server-side (allow-list); nilai default
  // 'uploads' hanya dipertahankan demi kompatibilitas tanda tangan fungsi.
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    throw new Error('Sesi tidak ditemukan. Silakan login ulang sebelum mengunggah file.');
  }

  const safeName = `${Date.now()}-${String(file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'x-file-name': safeName,
      'x-folder': folder,
      Authorization: `Bearer ${token}`,
    },
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
