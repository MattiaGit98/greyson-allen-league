import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261004000234_restore_backup_timeout.sql",
);

describe("timeout del ripristino completo", () => {
  it("estende soltanto la RPC di ripristino fino al massimo REST supportato", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toMatch(
      /alter\s+function\s+public\.restore_importable_league_backup\(jsonb\)/i,
    );
    expect(migration).toMatch(/set\s+statement_timeout\s*=\s*'60s'/i);
    expect(migration).not.toMatch(/alter\s+(role|database)/i);
  });
});

