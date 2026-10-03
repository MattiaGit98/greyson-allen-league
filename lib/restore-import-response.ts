export type RestoreImportSuccess = {
  ok: true;
  seasonName: string;
  timelineMoment: string;
  exportedAt: string;
};

export class RestoreImportRequestError extends Error {
  readonly restoreCompleted: boolean;
  readonly cleanupFailed: boolean;

  constructor(message: string, restoreCompleted = false, cleanupFailed = false) {
    super(message);
    this.name = "RestoreImportRequestError";
    this.restoreCompleted = restoreCompleted;
    this.cleanupFailed = cleanupFailed;
  }
}

export async function readRestoreImportResponse(response: Response): Promise<RestoreImportSuccess> {
  const body = await response.text();
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  let document: Record<string, unknown> | null = null;

  if (contentType.includes("json") || body.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(body) as unknown;
      document = isRecord(parsed) ? parsed : null;
    } catch {
      document = null;
    }
  }

  if (!response.ok || document?.ok !== true) {
    const serverMessage = typeof document?.error === "string" ? document.error : "";
    const message = serverMessage
      || "Ripristino non riuscito: il server ha rifiutato la richiesta. Nessun dato è stato modificato.";
    throw new RestoreImportRequestError(
      message,
      document?.restoreCompleted === true,
      document?.cleanupFailed === true,
    );
  }

  if (
    typeof document.seasonName !== "string"
    || typeof document.timelineMoment !== "string"
    || typeof document.exportedAt !== "string"
  ) {
    throw new RestoreImportRequestError(
      "Ripristino non riuscito: il server ha restituito una risposta non valida. Verifica lo stato della lega prima di riprovare.",
    );
  }

  return {
    ok: true,
    seasonName: document.seasonName,
    timelineMoment: document.timelineMoment,
    exportedAt: document.exportedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
