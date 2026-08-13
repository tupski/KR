import { IS_SELF_HOST, API_BASE } from './config';
import { getAccessToken } from './accessToken';

const withToken = (url) => {
  const token = getAccessToken();
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
};

export const resolveStorageUrl = (value) => {
  if (!value) return value;

  // Self-host proxy → cookie auth, tanpa token.
  if (value.startsWith('/api/storage/proxy')) return value;

  // Vercel blob legacy proxy → lampirkan token untuk otentikasi.
  if (value.startsWith('/api/blob')) return withToken(value);

  try {
    const parsed = new URL(value);
    const isPrivateBlob = parsed.hostname.endsWith('.private.blob.vercel-storage.com');
    if (!isPrivateBlob) return value;

    const pathname = parsed.pathname.replace(/^\/+/, '');
    return withToken(`/api/blob?pathname=${encodeURIComponent(pathname)}`);
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
