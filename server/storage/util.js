// Storage helpers: ref encode/decode, sanitize, raw body.
export function sanitize(name = '') {
  // Basename + strip karakter berbahaya; fallback timestamp.
  const base = String(name).split(/[\\/]/).pop() || '';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return cleaned || `file-${Date.now()}`;
}

export function sanitizeFolder(name = '') {
  const cleaned = String(name).replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return cleaned || 'uploads';
}

// ref: base64url('v:'|'s:'|'' + key); prefix inside encoded payload.
export function decodeRef(ref) {
  const raw = String(ref || '');
  if (!raw) throw new Error('invalid storage ref');
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  let provider = null;
  let key = decoded;
  if (decoded.startsWith('v:')) { provider = 'vercel_blob'; key = decoded.slice(2); }
  else if (decoded.startsWith('s:')) { provider = 'supabase'; key = decoded.slice(2); }
  if (!key) throw new Error('invalid storage ref');
  return { provider, key };
}
