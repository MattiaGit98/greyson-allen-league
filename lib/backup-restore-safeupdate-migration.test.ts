import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261004021000_safe_restore_team_update.sql",
);

describe("compatibilita del ripristino con safeupdate", () => {
  it("aggiunge un WHERE all'UPDATE globale senza disabilitare la protezione", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("where id is not null;");
    expect(migration).toContain("fragment_count <> 1");
    expect(migration).toContain("pg_get_function_identity_arguments(p.oid) = 'backup_document jsonb'");
    expect(migration).not.toMatch(/safeupdate[^\n]*(off|false|disable)/i);
    expect(migration).toMatch(/set\s+statement_timeout\s*=\s*'60s'/i);
  });
});

