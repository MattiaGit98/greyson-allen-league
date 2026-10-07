import { describe, expect, it } from "vitest";
import type { RosterEntry } from "@/lib/league-types";
import { recordPlayoffTeamOptionUse } from "./team-option-contract";

function entry(patch: Partial<RosterEntry>): RosterEntry {
  return {
    name: "Giocatore",
    cost: 5,
    contract: "27 + T.O.",
    role: "G",
    state: "active",
    slot: "g_league",
    teamCode: "AAA",
    ...patch,
  };
}

describe("segnalazione playoff della T.O.", () => {
  it("registra l'utilizzo senza esercitare il contratto né spostare lo slot", () => {
    expect(recordPlayoffTeamOptionUse(entry({}), "2026/27")).toMatchObject({
      slot: "g_league",
      contract: "27 + T.O.",
      playoffTeamOptionUsedSeason: "2026/27",
    });
  });

  it("rifiuta i duplicati e i giocatori fuori dalla G-League", () => {
    expect(() => recordPlayoffTeamOptionUse(entry({ playoffTeamOptionUsedSeason: "2026/27" }), "2026/27")).toThrow();
    expect(() => recordPlayoffTeamOptionUse(entry({ slot: "regular" }), "2026/27")).toThrow();
  });
});
