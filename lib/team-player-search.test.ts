import { describe, expect, it } from "vitest";
import { teamPlayerSearchMatches } from "./team-player-search";

const rosterEntries = [
  { name: "Mario Rossi", cost: 4, contract: "27", role: "G" as const, state: "active" as const, slot: "regular" as const, teamCode: "AAA" },
];
const qualifyingOfferRights = [
  { playerName: "Marco Bianchi", qualifyingAmount: 3, teamCode: "BBB" },
];

describe("ricerca giocatori nelle squadre", () => {
  it("propone sia i giocatori a roster sia le qualifying offer", () => {
    expect(teamPlayerSearchMatches({
      query: "mar",
      rosterEntries,
      qualifyingOfferRights,
      includeQualifyingOffers: true,
    })).toEqual([
      { name: "Marco Bianchi", teamCode: "BBB", section: "qualifying_offer", slotLabel: "Q.O." },
      { name: "Mario Rossi", teamCode: "AAA", section: "roster", slotLabel: "Roster" },
    ]);
  });

  it("esclude le Q.O. quando la loro sezione non è più visibile", () => {
    expect(teamPlayerSearchMatches({
      query: "marco",
      rosterEntries,
      qualifyingOfferRights,
      includeQualifyingOffers: false,
    })).toEqual([]);
  });
});
