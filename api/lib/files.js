/* eslint-env node */
const EXT_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', pdf: 'application/pdf',
};

// Basename + strip karakter berbahaya; fallback timestamp (tanpa ekstensi → ditolak validasi).
export function sanitize(name = '') {
  const base = String(name).split(/[\\/]/).pop() || '';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return cleaned || `file-${Date.now()}`;
}

export function sanitizeFolder(name = '') {
  const cleaned = String(name).replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return cleaned || 'uploads';
}

export function extensionOf(name = '') {
  const base = String(name).split(/[\\/]/).pop() || '';
  return base.includes('.') ? base.split('.').pop().toLowerCase() : '';
}

// Magic bytes → mime. null bila tidak dikenali.
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

// Ekstensi whitelist + magic bytes harus cocok; tipe tidak dikenal → tolak.
export function validateUploadFile({ fileName, buffer }) {
  const ext = extensionOf(fileName);
  const mime = EXT_MIME[ext];
  if (!mime) return { ok: false, error: 'Tipe file tidak diizinkan.' };
  const detected = magicType(buffer);
  if (!detected || detected !== mime) {
    return { ok: false, error: 'Isi file tidak cocok dengan ekstensinya.' };
  }
  return { ok: true, mime };
}

// Content type yang boleh di-serve inline; lainnya dipaksa attachment.
export function isSafeInlineContentType(ct = '') {
  const mime = String(ct).split(';')[0].trim().toLowerCase();
  return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/gif' ||
    mime === 'image/webp' || mime === 'application/pdf' || mime === 'application/octet-stream';
}
