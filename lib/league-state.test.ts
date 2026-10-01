import { describe, expect, it } from "vitest";
import { emptyLeagueState, normalizeState } from "./league-state";

describe("league state normalization", () => {
  it("non inventa dati quando lo stato corrente manca", () => {
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

});
