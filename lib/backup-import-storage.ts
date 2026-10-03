export const backupImportBucket = "league-backup-imports";
export const maximumImportableBackupBytes = 100 * 1024 * 1024;
export const backupUploadChunkBytes = 6 * 1024 * 1024;

const uuidFilePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/i;

export function createBackupImportPath(userId: string, objectId: string) {
  return `${userId}/${objectId}.json`;
}

export function isValidBackupImportPath(path: string, userId: string) {
  if (!path || !userId || path.includes("\\") || path.includes("..")) return false;
  const parts = path.split("/");
  return parts.length === 2
    && parts[0] === userId
    && uuidFilePattern.test(parts[1]);
}

export function formatMaximumImportableBackupSize() {
  return `${maximumImportableBackupBytes / (1024 * 1024)} MB`;
}
