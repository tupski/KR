// Re-export from centralized storage module
import { getFileUrl, isLegacyBlobUrl, uploadFile, deleteFile } from './storage';
export { getFileUrl, isLegacyBlobUrl, uploadFile, deleteFile };
// Legacy alias
export const resolveStorageUrl = getFileUrl;
