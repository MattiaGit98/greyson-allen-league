import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261006012506_atomic_slot_move_contract_draft_reset.sql",
);

describe("spostamenti slot e bozze contrattuali", () => {
  it("aggiorna stato, elimina le bozze coinvolte e registra il movimento nella stessa RPC", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("create or replace function public.apply_slot_movement");
    expect(migration).toMatch(/update public\.league_state_overrides[\s\S]*delete from public\.post_auction_contract_drafts[\s\S]*insert into public\.league_movements/);
    expect(migration).toContain("canonical_league_state_for_concurrency");
    expect(migration).toContain("for update");
  });

  it("il pannello invia alla RPC ogni giocatore effettivamente spostato", () => {
    const action = readFileSync(join(process.cwd(), "app", "admin", "slot", "actions.ts"), "utf8");
    expect(action).toContain('.rpc("apply_slot_movement"');
    expect(action).toContain("reset_contract_drafts: changes.map");
    expect(action).toContain("player_name: change.playerName");
  });
});
