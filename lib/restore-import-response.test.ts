import { describe, expect, it } from "vitest";
import { readRestoreImportResponse, RestoreImportRequestError } from "./restore-import-response";

describe("risposta HTTP del ripristino", () => {
  it("mostra un errore leggibile se Vercel restituisce testo invece di JSON", async () => {
    const response = new Response("Request Entity Too Large", {
      status: 413,
      headers: { "Content-Type": "text/plain" },
    });

    await expect(readRestoreImportResponse(response)).rejects.toThrow(
      "Ripristino non riuscito: il server ha rifiutato la richiesta. Nessun dato è stato modificato.",
    );
  });

  it("non espone errori di JSON.parse per una risposta HTML", async () => {
    const response = new Response("<html>Gateway error</html>", {
      status: 502,
      headers: { "Content-Type": "text/html" },
    });

    try {
      await readRestoreImportResponse(response);
      throw new Error("La risposta avrebbe dovuto essere rifiutata.");
    } catch (cause) {
      expect(cause).toBeInstanceOf(RestoreImportRequestError);
      expect((cause as Error).message).not.toMatch(/unexpected token|json/i);
    }
  });
});
