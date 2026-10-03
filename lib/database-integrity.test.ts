import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261003130133_state_concurrency_and_atomic_admin_operations.sql",
);

describe("integrità delle scritture amministrative", () => {
  it("non usa più la sostituzione non condizionata dello stato", () => {
    const callers = ["app", "components", "lib"]
      .flatMap((directory) => sourceFilesUnder(join(process.cwd(), directory)))
      .filter((file) => /\.rpc\(["']replace_league_state["']/.test(readFileSync(file, "utf8")));

    expect(callers).toEqual([]);
  });

  it("definisce RPC atomiche protette per salvataggi, fasi e identità delle squadre", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("replace_league_state_if_unchanged");
    expect(migration).toContain("rename_league_team");
    expect(migration).toContain("advance_league_transition");
    expect(migration).toContain("expected_state_payload");
    expect(migration).toContain("for update");
    expect(migration).toContain("revoke all on function public.replace_league_state(jsonb) from public, anon, authenticated");
    expect(migration).toContain("revoke all on function public.replace_league_state_and_draft_history(jsonb, jsonb) from public, anon, authenticated");
    expect(migration).toContain("revoke all on function public.set_active_season_status(public.season_status) from public, anon, authenticated");
  });

  it("chiude la stagione e azzera il calendario nella stessa RPC", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toMatch(/update public\.seasons[\s\S]*timeline_moment = 'offseason_start'[\s\S]*phase_dates = '\{\}'::jsonb/);
    expect(migration).toMatch(/update public\.calendar_events[\s\S]*set date_text = ''/);

    const action = readFileSync(join(process.cwd(), "app", "admin", "impostazioni", "actions.ts"), "utf8");
    expect(action).toContain('.rpc("advance_league_transition"');
    expect(action).not.toContain('.rpc("restore_league_phase_backup"');
  });
});

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(path);
    return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}
