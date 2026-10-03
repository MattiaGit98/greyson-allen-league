import {
  parseImportableLeagueBackup,
  type ImportableLeagueBackup,
} from "./importable-league-backup";
import {
  formatMaximumImportableBackupSize,
  isValidBackupImportPath,
  maximumImportableBackupBytes,
} from "./backup-import-storage";

export type TemporaryBackupStorage = {
  download(path: string): Promise<Blob>;
  remove(path: string): Promise<void>;
};

export type RestoreUploadedBackupDependencies = {
  storage: TemporaryBackupStorage;
  restore(backup: ImportableLeagueBackup): Promise<void>;
};

export type RestoreUploadedBackupResult = {
  backup: ImportableLeagueBackup;
  temporaryFileRemoved: true;
};

export class UploadedBackupRestoreError extends Error {
  readonly status: number;
  readonly restoreCompleted: boolean;
  readonly cleanupFailed: boolean;

  constructor(
    message: string,
    options: { status?: number; restoreCompleted?: boolean; cleanupFailed?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "UploadedBackupRestoreError";
    this.status = options.status ?? 400;
    this.restoreCompleted = options.restoreCompleted ?? false;
    this.cleanupFailed = options.cleanupFailed ?? false;
  }
}

export function assertBackupRestoreAdministrator(userId: string | null, isAdmin: boolean) {
  if (!userId) {
    throw new UploadedBackupRestoreError("Sessione scaduta.", { status: 401 });
  }
  if (!isAdmin) {
    throw new UploadedBackupRestoreError("Account non autorizzato.", { status: 403 });
  }
}

export async function restoreUploadedImportableBackup(
  userId: string,
  storagePath: string,
  dependencies: RestoreUploadedBackupDependencies,
): Promise<RestoreUploadedBackupResult> {
  if (!isValidBackupImportPath(storagePath, userId)) {
    throw new UploadedBackupRestoreError("Percorso del backup temporaneo non valido.", { status: 400 });
  }

  let backup: ImportableLeagueBackup | null = null;
  let restoreCompleted = false;
  let primaryError: UploadedBackupRestoreError | null = null;

  try {
    let file: Blob;
    try {
      file = await dependencies.storage.download(storagePath);
    } catch (cause) {
      throw new UploadedBackupRestoreError("Il backup temporaneo non è disponibile.", {
        status: 400,
        cause,
      });
    }

    if (file.size > maximumImportableBackupBytes) {
      throw new UploadedBackupRestoreError(
        `Il file supera il limite di ${formatMaximumImportableBackupSize()}.`,
        { status: 413 },
      );
    }

    let rawDocument: unknown;
    try {
      rawDocument = JSON.parse(await file.text());
    } catch (cause) {
      throw new UploadedBackupRestoreError("Il file caricato non contiene JSON valido.", {
        status: 400,
        cause,
      });
    }

    try {
      backup = parseImportableLeagueBackup(rawDocument);
    } catch (cause) {
      throw new UploadedBackupRestoreError(
        cause instanceof Error ? cause.message : "Il backup non è valido.",
        { status: 400, cause },
      );
    }

    try {
      await dependencies.restore(backup);
      restoreCompleted = true;
    } catch (cause) {
      throw new UploadedBackupRestoreError(
        cause instanceof Error ? cause.message : "Il ripristino PostgreSQL non è riuscito.",
        { status: 400, cause },
      );
    }
  } catch (cause) {
    primaryError = cause instanceof UploadedBackupRestoreError
      ? cause
      : new UploadedBackupRestoreError("Ripristino non riuscito.", { cause });
  }

  let cleanupError: unknown = null;
  try {
    await dependencies.storage.remove(storagePath);
  } catch (cause) {
    cleanupError = cause;
  }

  if (primaryError) {
    if (cleanupError) {
      throw new UploadedBackupRestoreError(
        `${primaryError.message} Non è stato possibile eliminare il file temporaneo.`,
        {
          status: primaryError.status,
          restoreCompleted: primaryError.restoreCompleted,
          cleanupFailed: true,
          cause: primaryError,
        },
      );
    }
    throw primaryError;
  }

  if (cleanupError) {
    throw new UploadedBackupRestoreError(
      "La lega è stata ripristinata, ma la pulizia del file temporaneo non è riuscita.",
      { status: 500, restoreCompleted, cleanupFailed: true, cause: cleanupError },
    );
  }

  if (!backup || !restoreCompleted) {
    throw new UploadedBackupRestoreError("Ripristino non riuscito.");
  }

  return { backup, temporaryFileRemoved: true };
}
