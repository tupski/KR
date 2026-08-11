import { IS_SELF_HOST, API_BASE } from './config';

export const resolveStorageUrl = (value) => {
  if (!value) return value;

  // Sudah berupa URL proxy internal (Vercel blob legacy atau self-host proxy)
  if (value.startsWith('/api/blob') || value.startsWith('/api/storage/proxy')) return value;

  try {
    const parsed = new URL(value);
    const isPrivateBlob = parsed.hostname.endsWith('.private.blob.vercel-storage.com');
    if (!isPrivateBlob) return value;

    const pathname = parsed.pathname.replace(/^\/+/, '');
    return `/api/blob?pathname=${encodeURIComponent(pathname)}`;
  } catch (_error) {
    return value;
  }
};

/**
 * Resolve untuk menampilkan file dari server storage (self-host).
 * ref = opaque key dari upload (tanpa path/as secret upstream, K9).
 */
export const proxyStorageUrl = (ref) => {
  if (!ref) return ref;
  if (ref.startsWith('/api/storage/proxy')) return IS_SELF_HOST ? `${API_BASE}${ref}` : ref;
  if (ref.startsWith('/api/blob') || ref.startsWith('http')) return ref;
  if (IS_SELF_HOST) return `${API_BASE}/api/storage/proxy?ref=${encodeURIComponent(ref)}`;
  return ref;
};
