import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20261005091829_public_auction_call_feed.sql", import.meta.url),
  "utf8",
);

describe("feed pubblico delle chiamate d'asta", () => {
  it("espone soltanto campi pubblici derivati e non gli stati completi", () => {
    expect(migration).toMatch(/create or replace view public\.league_movement_feed/i);
    expect(migration).toMatch(/auction_player_name/i);
    expect(migration).toMatch(/auction_season_name/i);
    expect(migration).not.toMatch(/select\s+movement\.before_state/i);
    expect(migration).not.toMatch(/select\s+movement\.after_state/i);
  });

  it("mantiene la lettura pubblica senza concedere scritture", () => {
    expect(migration).toMatch(/revoke all privileges[\s\S]*from public/i);
    expect(migration).toMatch(/grant select[\s\S]*to anon, authenticated/i);
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)/i);
  });
});
