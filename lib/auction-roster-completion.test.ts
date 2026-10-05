import { describe, expect, it } from "vitest";
import type { EditableLeagueState } from "./league-state";
import type { RosterEntry } from "./league-types";
import { incompleteAuctionRosterLabels, incompleteAuctionRosters } from "./auction-roster-completion";

function entry(name: string, teamCode: string, slot: RosterEntry["slot"] = "regular"): RosterEntry {
  return {
    name,
    teamCode,
    cost: 1,
    contract: "27",
    state: "active",
    slot,
  };
}

function state(): EditableLeagueState {
  return {
    teams: [
      { code: "AAA", name: "Alpha", owner: "A", credits: 0, cost: 0, players: 0, cutPlayers: 0, qualifyingOffers: 0, draftAssets: 0, nextSeasonCredits: 0, followingSeasonCredits: 0, slug: "alpha" },
      { code: "BBB", name: "Beta", owner: "B", credits: 0, cost: 0, players: 0, cutPlayers: 0, qualifyingOffers: 0, draftAssets: 0, nextSeasonCredits: 0, followingSeasonCredits: 0, slug: "beta" },
    ],
    rosterEntries: [
      ...Array.from({ length: 13 }, (_, index) => entry(`Alpha ${index}`, "AAA")),
      ...Array.from({ length: 12 }, (_, index) => entry(`Beta ${index}`, "BBB")),
      entry("Beta Two-way", "BBB", "two_way"),
      { ...entry("Beta tagliato", "BBB"), state: "cut" },
    ],
    draftAssets: [],
    qualifyingOfferRights: [],
    playerList: [],
    playerListStatus: "published",
  };
}

describe("completezza roster durante l'asta", () => {
  it("considera soltanto i giocatori attivi negli slot roster", () => {
    expect(incompleteAuctionRosters(state())).toEqual([{ teamCode: "BBB", regularPlayers: 12 }]);
  });

  it("genera la stessa dicitura usata dagli avvisi di avanzamento", () => {
    expect(incompleteAuctionRosterLabels(state())).toEqual(["BBB: 12/13 slot roster occupati"]);
  });
});
