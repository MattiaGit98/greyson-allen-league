import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20261007000000_movement_feed_search_indexes.sql", import.meta.url),
  "utf8",
);

describe("indici del registro movimenti", () => {
  it("indicizza ricerca testuale e cronologia inclusi i movimenti annullati", () => {
    expect(migration).toMatch(/create extension if not exists pg_trgm/i);
    expect(migration).toMatch(/using gin \(summary gin_trgm_ops\)/i);
    expect(migration).toMatch(/league_movements_feed_recent_all_idx[\s\S]*created_at desc/i);
    expect(migration).not.toMatch(/feed_recent_all_idx[\s\S]*where reverted_at is null/i);
  });
});
