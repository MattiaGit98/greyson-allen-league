import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261003231748_private_backup_import_storage.sql",
);

describe("Storage privato dei backup importabili", () => {
  it("crea un bucket privato limitato ai JSON e alla dimensione prevista", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("'league-backup-imports'");
    expect(migration).toMatch(/public\s*=\s*false/);
    expect(migration).toContain("104857600");
    expect(migration).toContain("array['application/json']::text[]");
  });

  it("limita upload, lettura e cancellazione agli admin e al proprietario", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("for insert");
    expect(migration).toContain("for select");
    expect(migration).toContain("for delete");
    expect(migration).toContain("(select public.is_admin())");
    expect(migration).toContain("owner_id = (select auth.uid())::text");
    expect(migration).toContain("(storage.foldername(name))[1] = (select auth.uid())::text");
    expect(migration).not.toContain("for update");
  });
});
