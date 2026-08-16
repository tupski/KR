/**
 * @file storage.js
 * @description Storage provider factory. Returns the active provider instance
 * based on the STORAGE_PROVIDER environment variable.
 *
 * Supported providers:
 *   - local  (default) — stores files on local disk
 *   - r2               — Cloudflare R2 via AWS SDK S3-compatible API
 *   - s3               — Generic S3-compatible (AWS, MinIO, etc.)
 *
 * Provider interface contract:
 *   upload(buffer, folder, filename, contentType) → Promise<{ url, pathname, access }>
 *   getFile(pathname)                             → Promise<{ stream, contentType }>
 *   delete(pathname)                              → Promise<void>
 *   list(prefix)                                  → Promise<Array<{ pathname, createdAt }>>
 *   resolveUrl(pathname)                          → string
 */

let _provider = null;

/**
 * Returns the singleton storage provider instance.
 * Lazily initialised on first call so that missing env vars only crash
 * when storage is actually used, not at import time.
 *
 * @returns {import('../modules/storage/providers/local.provider.js').LocalProvider
 *          |import('../modules/storage/providers/r2.provider.js').R2Provider
 *          |import('../modules/storage/providers/s3.provider.js').S3Provider}
 */
async function getStorageProvider() {
  if (_provider) return _provider;

  const providerName = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();

  switch (providerName) {
    case 'r2': {
      const { R2Provider } = await import('../modules/storage/providers/r2.provider.js');
      _provider = new R2Provider();
      break;
    }
    case 's3': {
      const { S3Provider } = await import('../modules/storage/providers/s3.provider.js');
      _provider = new S3Provider();
      break;
    }
    case 'local':
    default: {
      const { LocalProvider } = await import('../modules/storage/providers/local.provider.js');
      _provider = new LocalProvider();
      break;
    }
  }

  console.info(`📦 Storage provider: ${providerName}`);
  return _provider;
}

/**
 * Reset the cached provider — useful for testing.
 */
function resetStorageProvider() {
  _provider = null;
}

export { getStorageProvider, resetStorageProvider };
