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
});
