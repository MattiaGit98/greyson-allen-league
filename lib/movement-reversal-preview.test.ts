import { describe, expect, it } from "vitest";
import { emptyLeagueState } from "./league-state";
import { movementReversalPreview } from "./movement-reversal-preview";

describe("anteprima di annullamento caricata su richiesta", () => {
  it("mostra cap, ruoli e slot prima e dopo senza modificare lo stato", () => {
    const current = emptyLeagueState();
    current.teams = [{
      code: "AAA", name: "Alpha", owner: "A", credits: 0, cost: 0,
      players: 1, cutPlayers: 0, qualifyingOffers: 0, draftAssets: 0,
      nextSeasonCredits: 0, followingSeasonCredits: 0, slug: "aaa",
    }];
    current.rosterEntries = [{
      name: "Giocatore", teamCode: "AAA", role: "G", cost: 10,
      contract: "27", state: "active", slot: "regular",
    }];
    const restored = { ...current, rosterEntries: [] };

    const preview = movementReversalPreview({
      current, restored, seasonName: "2026/27",
      countTeamOptions: true, currentMoment: "contract_delivery",
    });

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      code: "AAA",
      slotsBefore: { regular: 1 },
      slotsAfter: { regular: 0 },
      rolesBefore: { G: 1 },
      rolesAfter: { G: 0 },
    });
    expect(preview[0]?.capSpaces[0]).toEqual({ seasonName: "2026/27", before: 990, after: 1000 });
    expect(current.rosterEntries).toHaveLength(1);
  });
});
