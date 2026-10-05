import { describe, expect, it } from "vitest";
import type { EditableLeagueState } from "./league-state";
import type { RosterEntry } from "./league-types";
import { auctionTeamCompletionLabels, incompleteAuctionRosterLabels, incompleteAuctionRosters } from "./auction-roster-completion";

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
      ...Array.from({ length: 11 }, (_, index) => entry(`Beta ${index}`, "BBB")),
      entry("Beta Two-way", "BBB", "two_way"),
      entry("Beta G-League", "BBB", "g_league"),
      { ...entry("Beta tagliato", "BBB"), state: "cut" },
    ],
    draftAssets: [],
    qualifyingOfferRights: [],
    playerList: [],
    playerListStatus: "published",
  };
}

describe("completezza roster durante l'asta", () => {
  it("conta i giocatori attivi di roster, Two-way e G-League", () => {
    expect(incompleteAuctionRosters(state())).toEqual([]);
  });

  it("genera la stessa dicitura usata dagli avvisi di avanzamento", () => {
    const current = state();
    current.rosterEntries = current.rosterEntries.filter((entry) => entry.name !== "Beta Two-way");
    expect(incompleteAuctionRosterLabels(current)).toEqual(["BBB: 12/13 giocatori firmati"]);
  });

  it("segnala soltanto l'ala mancante con una distribuzione 7-4-6 tra tutti gli slot validi", () => {
    const current = state();
    const roles = [
      ...Array.from({ length: 7 }, () => "G" as const),
      ...Array.from({ length: 4 }, () => "A" as const),
      ...Array.from({ length: 6 }, () => "C" as const),
    ];
    current.playerList = roles.map((role, index) => ({ name: `Giocatore ${index}`, role, realTeam: "", rookie: false, under23: false }));
    current.rosterEntries = roles.map((role, index) => entry(
      `Giocatore ${index}`,
      "AAA",
      index < 12 ? "regular" : index < 14 ? "two_way" : "g_league",
    ));
    current.rosterEntries.forEach((player, index) => { player.role = roles[index]; });

    expect(auctionTeamCompletionLabels(current, "auction_start")).toContain("AAA: manca 1 ala");
  });
});
