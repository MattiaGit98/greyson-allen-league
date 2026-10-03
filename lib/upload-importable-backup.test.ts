import { describe, expect, it } from "vitest";
import { storageResumableUploadEndpoint } from "./upload-importable-backup";

describe("endpoint diretto per l'upload dei backup", () => {
  it("usa il dominio Storage diretto di Supabase in produzione", () => {
    expect(storageResumableUploadEndpoint("https://abcdefgh.supabase.co"))
      .toBe("https://abcdefgh.storage.supabase.co/storage/v1/upload/resumable");
  });

  it("mantiene l'origine configurata negli ambienti locali", () => {
    expect(storageResumableUploadEndpoint("http://127.0.0.1:54321"))
      .toBe("http://127.0.0.1:54321/storage/v1/upload/resumable");
  });
});
