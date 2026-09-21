import { describe, expect, it } from "vitest";
import { emptyLeagueState } from "./league-state";
import { renameTeamIdentity, replaceTeamCodeInContent } from "./team-identity";

describe("rinomina squadra", () => {
  it("aggiorna la sigla della scelta anche se la scelta appartiene a un'altra squadra", () => {
    const state = emptyLeagueState();
    state.teams = [
      { code: "OLD", name: "Vecchia", owner: "Mario", slug: "old", credits: 0, cost: 0, players: 0, cutPlayers: 0, qualifyingOffers: 0, draftAssets: 0, nextSeasonCredits: 0, followingSeasonCredits: 0 },
      { code: "BBB", name: "Altra", owner: "Luigi", slug: "bbb", credits: 0, cost: 0, players: 0, cutPlayers: 0, qualifyingOffers: 0, draftAssets: 0, nextSeasonCredits: 0, followingSeasonCredits: 0 },
    ];
    state.rosterEntries = [{ name: "Giocatore", cost: 1, contract: "2027", state: "active", slot: "regular", teamCode: "OLD" }];
    state.qualifyingOfferRights = [{ playerName: "Altro giocatore", qualifyingAmount: 1, teamCode: "OLD" }];
    state.draftAssets = [{
      label: "Protetta top 5; contropartita: 1ª scelta 2029 OLD",
      round: "1° giro",
      year: 2028,
      originOrOverall: "OLD",
      originTeamCode: "OLD",
      teamCode: "BBB",
      clauseResolution: {
        agreementId: "protection:2028:1° giro:OLD:2029:BBB",
        role: "protected",
        subjectYear: 2028,
        subjectOriginTeamCode: "OLD",
        counterpartYear: 2029,
        counterpartOriginTeamCode: "BBB",
        originalOwnerTeamCode: "OLD",
      },
    }];
    state.draftOrders = [{ year: 2028, position: 1, originTeamCode: "OLD", isBonus: false, round: "1° giro", cost: 5 }];

    const renamed = renameTeamIdentity(state, "OLD", "NEW", "Nuova", "Anna");

    expect(renamed.teams[0]).toMatchObject({ code: "NEW", name: "Nuova", owner: "Anna", slug: "new" });
    expect(renamed.rosterEntries[0].teamCode).toBe("NEW");
    expect(renamed.qualifyingOfferRights[0].teamCode).toBe("NEW");
    expect(renamed.draftOrders?.[0].originTeamCode).toBe("NEW");
    expect(renamed.draftAssets[0]).toMatchObject({
      teamCode: "BBB",
      originTeamCode: "NEW",
      originOrOverall: "NEW",
      label: "Protetta top 5; contropartita: 1ª scelta 2029 NEW",
      clauseResolution: {
        agreementId: "protection:2028:1° giro:NEW:2029:BBB",
        subjectOriginTeamCode: "NEW",
        counterpartOriginTeamCode: "BBB",
        originalOwnerTeamCode: "NEW",
      },
    });
    expect(state.draftAssets[0].originTeamCode).toBe("OLD");
  });

  it("non cambia numeri, sigle diverse o frammenti di altre parole", () => {
    const state = emptyLeagueState();
    state.draftAssets = [{ label: "Scelta OLDEN", round: "2° giro", year: 2028, originOrOverall: 12, teamCode: "BBB" }];

    expect(renameTeamIdentity(state, "OLD", "NEW", "Nuova", "Anna").draftAssets[0]).toMatchObject({
      label: "Scelta OLDEN",
      originOrOverall: 12,
      teamCode: "BBB",
    });
  });

  it("aggiorna i riferimenti nelle classifiche e nei tabelloni senza toccare altri valori", () => {
    expect(replaceTeamCodeInContent({ positions: ["OLD", "BBB"], results: { OLD: { wins: 2 }, BBB: { wins: 1 } } }, "OLD", "NEW"))
      .toEqual({ positions: ["NEW", "BBB"], results: { NEW: { wins: 2 }, BBB: { wins: 1 } } });
  });
});
