// Storage helpers: ref encode/decode, sanitize, magic bytes, raw body.
const BLOCKED_EXT = new Set(['html', 'htm', 'svg', 'xml', 'xhtml', 'js', 'mjs', 'exe', 'bat', 'cmd', 'sh']);

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
  if (key.includes('..') || key.startsWith('/')) throw new Error('invalid storage ref');
  return { provider, key };
}

export function extensionOf(fileName = '') {
  const base = String(fileName).split(/[\\/]/).pop() || '';
  return base.includes('.') ? base.split('.').pop().toLowerCase() : '';
}

// Whitelist ekstensi yang boleh diupload; false → tolak.
export function isAllowedExtension(fileName) {
  const ext = extensionOf(fileName);
  return !!ext && !BLOCKED_EXT.has(ext) && /^[a-z0-9]{1,8}$/.test(ext);
}

// Cek magic bytes → mime. null bila tidak dikenal / tidak terdeteksi.
export function magicType(buf) {
  if (!buf || buf.length < 12) return null;
  const b = buf;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'image/webp'; // RIFF....
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  return null;
}

// Mime yang bisa di-serve lewat proxy sebagai inline (gambar/pdf aman).
export function isSafeInlineContentType(ct = '') {
  const mime = String(ct).split(';')[0].trim().toLowerCase();
  return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/gif' ||
    mime === 'image/webp' || mime === 'application/pdf' || mime === 'application/octet-stream';
}
