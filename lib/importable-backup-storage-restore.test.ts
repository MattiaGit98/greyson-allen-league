import { describe, expect, it, vi } from "vitest";
import { defaultCompetitionMap } from "./competitions";
import { emptyHistoryCompetitionMap } from "./history-competitions";
import {
  assertBackupRestoreAdministrator,
  restoreUploadedImportableBackup,
  UploadedBackupRestoreError,
  type TemporaryBackupStorage,
} from "./importable-backup-storage-restore";
import {
  createImportableBackupDocument,
  type ImportableLeaguePayload,
} from "./importable-league-backup";
import { emptyLeagueState } from "./league-state";
import { maximumImportableBackupBytes } from "./backup-import-storage";

const userId = "31ff4113-1c5d-4c94-b3d8-b834ae1102d0";
const storagePath = `${userId}/14b307ee-e873-4df0-a5d4-73d44550db1f.json`;

describe("ripristino da backup temporaneo", () => {
  it("ripristina un backup valido e rimuove il file temporaneo", async () => {
    const backup = createImportableBackupDocument(payload(), "2026-10-03T12:00:00.000Z");
    const storage = memoryStorage(new Blob([JSON.stringify(backup)], { type: "application/json" }));
    const restore = vi.fn(async () => undefined);

    const result = await restoreUploadedImportableBackup(userId, storagePath, { storage, restore });

    expect(result.backup).toEqual(backup);
    expect(restore).toHaveBeenCalledOnce();
    expect(storage.download).toHaveBeenCalledWith(storagePath);
    expect(storage.remove).toHaveBeenCalledWith(storagePath);
  });

  it("rifiuta un checksum errato senza richiamare il restore e pulisce il file", async () => {
    const backup = createImportableBackupDocument(payload());
    backup.payload.activeSeason.name = "2027/28";
    const storage = memoryStorage(new Blob([JSON.stringify(backup)]));
    const restore = vi.fn(async () => undefined);

    await expect(restoreUploadedImportableBackup(userId, storagePath, { storage, restore }))
      .rejects.toThrow(/integrità/i);
    expect(restore).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledOnce();
  });

  it("rifiuta un file non JSON e lo pulisce", async () => {
    const storage = memoryStorage(new Blob(["Request Entity Too Large"]));
    const restore = vi.fn(async () => undefined);

    await expect(restoreUploadedImportableBackup(userId, storagePath, { storage, restore }))
      .rejects.toThrow(/json valido/i);
    expect(restore).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledOnce();
  });

  it("rifiuta in modo controllato un file oltre il limite e lo pulisce", async () => {
    const oversizedFile = new Blob(["{}"]);
    Object.defineProperty(oversizedFile, "size", { value: maximumImportableBackupBytes + 1 });
    const storage = memoryStorage(oversizedFile);
    const restore = vi.fn(async () => undefined);

    await expect(restoreUploadedImportableBackup(userId, storagePath, { storage, restore }))
      .rejects.toMatchObject({ status: 413 });
    expect(restore).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledOnce();
  });

  it("rifiuta path estranei o manipolati prima di accedere allo Storage", async () => {
    const storage = memoryStorage(new Blob(["{}"]));
    const restore = vi.fn(async () => undefined);

    await expect(restoreUploadedImportableBackup(userId, `${userId}/../segreto.json`, { storage, restore }))
      .rejects.toThrow(/percorso/i);
    await expect(restoreUploadedImportableBackup(userId, `altro-utente/14b307ee-e873-4df0-a5d4-73d44550db1f.json`, { storage, restore }))
      .rejects.toThrow(/percorso/i);
    expect(storage.download).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("rifiuta un utente non amministratore", () => {
    expect(() => assertBackupRestoreAdministrator(userId, false))
      .toThrowError(UploadedBackupRestoreError);
    try {
      assertBackupRestoreAdministrator(userId, false);
    } catch (cause) {
      expect(cause).toMatchObject({ status: 403 });
    }
  });

  it("segnala la pulizia fallita dopo un restore già completato", async () => {
    const backup = createImportableBackupDocument(payload());
    const storage = memoryStorage(new Blob([JSON.stringify(backup)]));
    vi.mocked(storage.remove).mockRejectedValueOnce(new Error("Storage non disponibile"));

    await expect(restoreUploadedImportableBackup(userId, storagePath, {
      storage,
      restore: async () => undefined,
    })).rejects.toMatchObject({ restoreCompleted: true, cleanupFailed: true, status: 500 });
  });
});

function memoryStorage(file: Blob): TemporaryBackupStorage {
  return {
    download: vi.fn(async () => file),
    remove: vi.fn(async () => undefined),
  };
}

function payload(): ImportableLeaguePayload {
  return {
    activeSeason: {
      name: "2026/27",
      status: "offseason",
      timeline_moment: "offseason_start",
      team_options_resolved: false,
      trade_deadline_passed: false,
      phase_dates: {},
    },
    teamRecords: [],
    leagueState: emptyLeagueState(),
    calendar: [],
    competitions: defaultCompetitionMap(0),
    history: emptyHistoryCompetitionMap(),
    contractDrafts: [],
    movements: [],
  };
}
