import { describe, expect, it } from "vitest";
import { buildMovementReversal, movementReversalSlotErrors } from "./league-movements";
import type { EditableLeagueState } from "./league-state";

function state(teamCode: string): EditableLeagueState {
  return {
    teams: [], draftAssets: [], qualifyingOfferRights: [], playerList: [], playerListStatus: "published",
    rosterEntries: [{ name: "Player", teamCode, cost: 10, contract: "28", state: "active", slot: "regular" }],
  };
}

describe("movement reversal", () => {
  it("restores a traded player when the affected player is unchanged", () => {
    const before = state("AAA");
    const after = state("BBB");
    const current = { ...after, qualifyingOfferRights: [{ playerName: "Other", teamCode: "CCC", qualifyingAmount: 1 }] };
    expect(buildMovementReversal(current, before, after).rosterEntries[0].teamCode).toBe("AAA");
    expect(buildMovementReversal(current, before, after).qualifyingOfferRights).toHaveLength(1);
  });

  it("blocks reversal after the same player moves again", () => {
    expect(() => buildMovementReversal(state("CCC"), state("AAA"), state("BBB"))).toThrow(/modificati successivamente/);
  });

  it("removes a player that was added to the list by the reverted movement", () => {
    const before = state("AAA");
    const addedPlayer = { name: "Nuovo Player", role: "G" as const, realTeam: "BOS", rookie: false, under23: false };
    const after = { ...state("BBB"), playerList: [addedPlayer] };
    const restored = buildMovementReversal(after, before, after);
    expect(restored.playerList).toEqual([]);
  });

  it("blocks reversal when the automatically added list row was later edited", () => {
    const before = state("AAA");
    const addedPlayer = { name: "Nuovo Player", role: "G" as const, realTeam: "BOS", rookie: false, under23: false };
    const after = { ...state("BBB"), playerList: [addedPlayer] };
    const current = { ...after, playerList: [{ ...addedPlayer, realTeam: "NYK" }] };
    expect(() => buildMovementReversal(current, before, after)).toThrow(/listone.*modificati successivamente/);
  });

  it("reorders every restored roster block by descending cost", () => {
    const before = state("AAA");
    before.rosterEntries = [
      { name: "Low", teamCode: "AAA", cost: 5, contract: "28", state: "active", slot: "regular" },
      { name: "Player", teamCode: "AAA", cost: 10, contract: "28", state: "active", slot: "regular" },
      { name: "High", teamCode: "AAA", cost: 20, contract: "28", state: "active", slot: "regular" },
    ];
    const after = { ...before, rosterEntries: before.rosterEntries.filter((entry) => entry.name !== "Player") };
    const restored = buildMovementReversal(after, before, after);

    expect(restored.rosterEntries.map((entry) => entry.name)).toEqual(["High", "Player", "Low"]);
  });

  it("reports a slot conflict before restoring a player", () => {
    const regularPlayer = (index: number) => ({
      name: `Player ${index}`,
      teamCode: "AAA",
      cost: index,
      contract: "28",
      state: "active" as const,
      slot: "regular" as const,
    });
    const before = state("AAA");
    before.rosterEntries = Array.from({ length: 16 }, (_, index) => regularPlayer(index + 1));
    const after = { ...before, rosterEntries: before.rosterEntries.slice(0, 15) };
    const restored = buildMovementReversal(after, before, after);

    expect(movementReversalSlotErrors(after, restored)).toEqual([
      "AAA: slot Roster oltre il limite (16/15).",
    ]);
  });
});
