export type RestoreImportStage = "backup" | "upload" | "verify" | "cleanup";

export type RestoreImportFlowDependencies<Result> = {
  downloadCurrentBackup(): Promise<void>;
  uploadBackup(registerStoragePath: (path: string) => void): Promise<string>;
  requestRestore(storagePath: string): Promise<Result>;
  removeTemporaryBackup(storagePath: string): Promise<void>;
  onStage(stage: RestoreImportStage): void;
  onCleanupError?(cause: unknown): void;
};

export async function executeRestoreImportFlow<Result>(
  dependencies: RestoreImportFlowDependencies<Result>,
): Promise<Result> {
  let storagePath = "";

  dependencies.onStage("backup");
  await dependencies.downloadCurrentBackup();

  dependencies.onStage("upload");
  try {
    const uploadedPath = await dependencies.uploadBackup((path) => {
      storagePath = path;
    });
    storagePath = uploadedPath;

    dependencies.onStage("verify");
    return await dependencies.requestRestore(storagePath);
  } finally {
    if (storagePath) {
      dependencies.onStage("cleanup");
      try {
        await dependencies.removeTemporaryBackup(storagePath);
      } catch (cause) {
        dependencies.onCleanupError?.(cause);
      }
    }
  }
}
