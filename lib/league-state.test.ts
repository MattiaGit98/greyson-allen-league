import { describe, expect, it } from "vitest";
import { emptyLeagueState, normalizeState } from "./league-state";

describe("league state normalization", () => {
  it("does not inject the initial imported snapshot into missing runtime data", () => {
    expect(normalizeState(null)).toEqual(emptyLeagueState());
    expect(normalizeState({})).toMatchObject({
      teams: [],
      rosterEntries: [],
      draftAssets: [],
      qualifyingOfferRights: [],
      playerList: [],
    });
  });

  it("preserves the years whose Draft order has been finalized", () => {
    expect(normalizeState({
      ...emptyLeagueState(),
      finalizedDraftPositionYears: [2027, 2028, "2029"],
    }).finalizedDraftPositionYears).toEqual([2027, 2028]);
  });

  it("keeps only Draft rows in the current explicit format", () => {
    const normalized = normalizeState({
      ...emptyLeagueState(),
      draftPositionYears: [2026],
      draftOrders: [
        { year: 2027, position: 1, originTeamCode: "AAA", isBonus: false },
        { year: 2027, position: 2, originTeamCode: "BBB", isBonus: false, round: "1° giro", cost: null },
      ],
    });

    expect(normalized.draftOrders).toEqual([
      { year: 2027, position: 2, originTeamCode: "BBB", isBonus: false, round: "1° giro", cost: null },
    ]);
    expect("draftPositionYears" in normalized).toBe(false);
  });

  it("converte i vecchi contratti X2 nella seconda stagione con rookie extension", () => {
    const normalized = normalizeState({
      ...emptyLeagueState(),
      rosterEntries: [{
        name: "Rookie",
        teamCode: "AAA",
        cost: 9,
        contract: "28 (2X)",
        state: "active",
        slot: "regular",
        teamOptionBaseCost: 9,
        teamOptionFinalYear: 2028,
      }],
    });

    expect(normalized.rosterEntries[0]).toMatchObject({
      cost: 9,
      contract: "27 + R.E.",
    });
    expect(normalized.rosterEntries[0].teamOptionBaseCost).toBeUndefined();
    expect(normalized.rosterEntries[0].teamOptionFinalYear).toBeUndefined();
  });
});
