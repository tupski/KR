/**
 * Centralized storage helpers — client-side.
 * R2 upload via /api/upload server endpoint.
 * Legacy Vercel Blob URLs handled transparently.
 */

import { supabase } from './customSupabaseClient';

/**
 * Get Supabase session token for authenticated requests
 * @returns {Promise<string|null>} - Access token or null if not authenticated
 */
async function getSessionToken() {
  try {
    // First, try to get the session
    const {
      data: { session },
    } = await supabase.auth.getSession();
    
    if (session?.access_token) {
      return session.access_token;
    }

    // Fallback: try to get user (which validates the token)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.warn('[storage] Failed to get user:', userError);
      return null;
    }

    if (!user) {
      console.warn('[storage] No authenticated user found');
      return null;
    }

    // If we have a user but no session, try to refresh the session
    const {
      data: { session: refreshedSession },
      error: refreshError,
    } = await supabase.auth.refreshSession();

    if (refreshError) {
      console.warn('[storage] Failed to refresh session:', refreshError);
      return null;
    }

    return refreshedSession?.access_token || null;
  } catch (error) {
    console.error('[storage] Failed to get session token:', error);
    return null;
  }
}

/**
 * Check if URL is a legacy Vercel Blob URL
 * @param {string|null|undefined} url
 * @returns {boolean}
 */
export function isLegacyBlobUrl(url) {
  if (!url) return false;
  return url.startsWith('/api/blob?pathname=') || url.includes('.private.blob.vercel-storage.com');
}

/**
 * Get display URL — handles both legacy and new URLs
 * @param {string|null|undefined} path - stored path from database
 * @returns {string} URL ready for img src
 */
export function getFileUrl(path) {
  if (!path) return '';
  // Legacy: /api/blob?pathname=... → return as-is
  if (path.startsWith('/api/blob')) return path;
  // Legacy: full Vercel Blob URL → convert to proxy
  if (path.includes('.blob.vercel-storage.com')) {
    try {
      const parsed = new URL(path);
      const pathname = parsed.pathname.replace(/^\/+/, '');
      return `/api/blob?pathname=${encodeURIComponent(pathname)}`;
    } catch {
      return path;
    }
  }
  // New: just a key like "ktp-images/file.jpg" → use R2 public URL
  if (!path.startsWith('http')) {
    const baseUrl =
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_R2_PUBLIC_BASE_URL) ||
      'https://cdn.artupski.com';
    return `${baseUrl}/${path}`;
  }
  return path;
}

/**
 * Upload file to R2 storage
 * @param {File} file
 * @param {string} folder - e.g., 'ktp-images', 'proof-images', 'avatars'
 * @returns {Promise<{url: string, key: string}>}
 */
export async function uploadFile(file, folder = 'uploads') {
  if (!file) throw new Error('File kosong');

  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

  if (file.size > MAX_SIZE) throw new Error('Ukuran file maksimal 10MB');
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Tipe file tidak diizinkan');

  const safeName = `${Date.now()}-${String(file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const token = await getSessionToken();
  
  if (!token) {
    console.error('[storage] No authentication token available. User may not be logged in.');
    throw new Error('Sesi tidak valid. Silakan login ulang dan coba lagi.');
  }

  const headers = {
    'Content-Type': file.type || 'application/octet-stream',
    'x-file-name': safeName,
    'x-folder': folder,
    'Authorization': `Bearer ${token}`,
  };

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers,
      body: file,
    });

    if (!response.ok) {
      let message = 'Gagal upload.';
      let statusText = response.statusText;
      
      try {
        const err = await response.json();
        message = err?.error || message;
      } catch {
        // fallback to status text
      }

      if (response.status === 401) {
        console.error('[storage] Upload failed: Unauthorized (401). Token may be invalid or expired.');
        throw new Error('Sesi Anda telah berakhir. Silakan login ulang dan coba lagi.');
      }

      console.error(`[storage] Upload failed: ${response.status} ${statusText}. Message: ${message}`);
      throw new Error(message);
    }

    const data = await response.json();
    if (!data?.key) throw new Error('Key file tidak ditemukan dari server.');
    return { url: data.url, key: data.key };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Sesi')) {
      throw error; // Re-throw auth-related errors
    }
    console.error('[storage] Upload error:', error);
    throw error;
  }
}

/**
 * Delete file from R2
 * @param {string} key - object key in R2
 * @returns {Promise<void>}
 */
export async function deleteFile(key) {
  if (!key) return;
  if (isLegacyBlobUrl(key)) {
    console.warn('Cannot delete legacy blob file via R2 API');
    return;
  }

  const token = await getSessionToken();
  const headers = { 'Content-Type': 'application/json' };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch('/api/upload', {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ key }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error || 'Gagal menghapus file');
  }
}
