import { describe, expect, it, vi } from "vitest";
import { executeRestoreImportFlow } from "./restore-import-flow";

describe("sequenza del ripristino importabile", () => {
  it("non carica né ripristina nulla se il backup preventivo fallisce", async () => {
    const uploadBackup = vi.fn(async () => "path");
    const requestRestore = vi.fn(async () => "ok");
    const removeTemporaryBackup = vi.fn(async () => undefined);

    await expect(executeRestoreImportFlow({
      downloadCurrentBackup: async () => { throw new Error("Download non riuscito"); },
      uploadBackup,
      requestRestore,
      removeTemporaryBackup,
      onStage: () => undefined,
    })).rejects.toThrow("Download non riuscito");

    expect(uploadBackup).not.toHaveBeenCalled();
    expect(requestRestore).not.toHaveBeenCalled();
    expect(removeTemporaryBackup).not.toHaveBeenCalled();
  });

  it("esegue backup, upload, restore e pulizia nell'ordine previsto", async () => {
    const events: string[] = [];
    const result = await executeRestoreImportFlow({
      downloadCurrentBackup: async () => { events.push("download-preventivo"); },
      uploadBackup: async (registerPath) => {
        registerPath("utente/file.json");
        events.push("upload-diretto");
        return "utente/file.json";
      },
      requestRestore: async (path) => {
        events.push(`restore:${path}`);
        return "ripristinato";
      },
      removeTemporaryBackup: async (path) => { events.push(`pulizia:${path}`); },
      onStage: (stage) => { events.push(`stato:${stage}`); },
    });

    expect(result).toBe("ripristinato");
    expect(events).toEqual([
      "stato:backup",
      "download-preventivo",
      "stato:upload",
      "upload-diretto",
      "stato:verify",
      "restore:utente/file.json",
      "stato:cleanup",
      "pulizia:utente/file.json",
    ]);
  });

  it("prova a pulire anche un upload fallito dopo la creazione del path", async () => {
    const removeTemporaryBackup = vi.fn(async () => undefined);

    await expect(executeRestoreImportFlow({
      downloadCurrentBackup: async () => undefined,
      uploadBackup: async (registerPath) => {
        registerPath("utente/parziale.json");
        throw new Error("Connessione interrotta");
      },
      requestRestore: async () => "non raggiunto",
      removeTemporaryBackup,
      onStage: () => undefined,
    })).rejects.toThrow("Connessione interrotta");

    expect(removeTemporaryBackup).toHaveBeenCalledWith("utente/parziale.json");
  });
});
