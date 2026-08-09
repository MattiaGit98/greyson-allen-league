import { describe, expect, it } from "vitest";
import type { EditableLeagueState } from "./league-state";
import { applyValidatedTrade, existingTradeClauseAgreements } from "./trade-state";

function state(): EditableLeagueState {
  return {
    teams: [
      { code: "AAA", name: "Alpha", owner: "A", credits: 0, cost: 0, players: 1, cutPlayers: 0, qualifyingOffers: 1, draftAssets: 1, nextSeasonCredits: 0, followingSeasonCredits: 0, slug: "aaa" },
      { code: "BBB", name: "Beta", owner: "B", credits: 0, cost: 0, players: 0, cutPlayers: 0, qualifyingOffers: 0, draftAssets: 1, nextSeasonCredits: 0, followingSeasonCredits: 0, slug: "bbb" },
    ],
    rosterEntries: [{
      name: "Rookie Pending",
      cost: 23,
      contract: "PENDING",
      state: "active",
      slot: "two_way",
      teamCode: "AAA",
      auctionAcquisition: "restricted_free_agent",
      contractStartSeason: "2026/27",
      twoWayPromotionLocked: true,
    }],
    draftAssets: [
      { label: "Scelta", round: "1° giro", year: 2027, originOrOverall: "AAA", teamCode: "AAA" },
      { label: "Scelta", round: "1° giro", year: 2027, originOrOverall: "BBB", teamCode: "BBB" },
    ],
    qualifyingOfferRights: [{ playerName: "Q Player", qualifyingAmount: 17, teamCode: "AAA" }],
    playerList: [],
    playerListStatus: "published",
  };
}

describe("applicazione di uno scambio", () => {
  it("trasferisce il giocatore senza alterare contratto o limitazioni di acquisto", () => {
    const before = state();
    const after = applyValidatedTrade(before, {
      playerMoves: [{ stateIndex: 0, toTeamCode: "BBB", destinationSlot: "regular" }],
      pickMoves: [],
      pickClauses: [],
      existingClauseChanges: [],
      qualifyingOfferMoves: [],
      cuts: [],
    });

    expect(after.rosterEntries[0]).toEqual({
      ...before.rosterEntries[0],
      teamCode: "BBB",
      slot: "regular",
    });
    expect(after.rosterEntries[0]).toMatchObject({
      contract: "PENDING",
      cost: 23,
      auctionAcquisition: "restricted_free_agent",
      contractStartSeason: "2026/27",
      twoWayPromotionLocked: true,
    });
  });

  it("applica una promozione contestuale senza alterare il contratto", () => {
    const before = state();
    const after = applyValidatedTrade(before, {
      playerMoves: [],
      pickMoves: [],
      pickClauses: [],
      existingClauseChanges: [],
      qualifyingOfferMoves: [],
      cuts: [],
      promotions: [{ stateIndex: 0, destinationSlot: "regular" }],
    });

    expect(after.rosterEntries[0]).toEqual({ ...before.rosterEntries[0], slot: "regular" });
  });

  it("trasferisce scelte e Q.O. e registra entrambe le facce di uno swap", () => {
    const after = applyValidatedTrade(state(), {
      playerMoves: [],
      pickMoves: [{ stateIndex: 0, toTeamCode: "BBB" }],
      pickClauses: [{ subjectIndex: 0, counterpartyIndex: 1, clause: "swap" }],
      existingClauseChanges: [],
      qualifyingOfferMoves: [{ stateIndex: 0, toTeamCode: "BBB" }],
      cuts: [],
    });

    expect(after.draftAssets[0]).toMatchObject({
      teamCode: "BBB",
      label: "Diritto di swap con BBB",
      clauseResolution: { role: "swap_right", originalOwnerTeamCode: "BBB" },
    });
    expect(after.draftAssets[1]).toMatchObject({
      label: "Subisce il diritto di swap con AAA",
      clauseResolution: { role: "swap_subject", originalOwnerTeamCode: "BBB" },
    });
    expect(after.qualifyingOfferRights[0].teamCode).toBe("BBB");
  });

  it("trasferisce al nuovo proprietario anche diritti e doveri di una clausola esistente", () => {
    const before = state();
    before.draftAssets[0] = {
      ...before.draftAssets[0],
      label: "Diritto di swap con BBB",
      clauseResolution: {
        agreementId: "swap:2027:1:AAA:BBB",
        role: "swap_right",
        subjectYear: 2027,
        subjectOriginTeamCode: "AAA",
        counterpartYear: 2027,
        counterpartOriginTeamCode: "BBB",
        originalOwnerTeamCode: "AAA",
      },
    };
    const after = applyValidatedTrade(before, {
      playerMoves: [],
      pickMoves: [{ stateIndex: 0, toTeamCode: "BBB" }],
      pickClauses: [],
      existingClauseChanges: [],
      qualifyingOfferMoves: [],
      cuts: [],
    });

    expect(after.draftAssets[0]).toMatchObject({
      teamCode: "BBB",
      label: "Diritto di swap con BBB",
      clauseResolution: { agreementId: "swap:2027:1:AAA:BBB", originalOwnerTeamCode: "BBB" },
    });
  });

  it("permette di eliminare un accordo esistente senza eliminare le scelte", () => {
    const before = state();
    before.draftAssets[0].label = "Diritto di swap con BBB";
    before.draftAssets[1].label = "Subisce il diritto di swap con AAA";
    const after = applyValidatedTrade(before, {
      playerMoves: [],
      pickMoves: [],
      pickClauses: [],
      existingClauseChanges: [{ subjectIndex: 0, counterpartyIndex: 1, clause: null }],
      qualifyingOfferMoves: [],
      cuts: [],
    });

    expect(after.draftAssets.map((asset) => asset.label)).toEqual(["Scelta", "Scelta"]);
  });

  it("sostituisce una clausola nello stesso scambio dopo aver rimosso quella esistente", () => {
    const before = state();
    before.draftAssets[0].label = "Diritto di swap con BBB";
    before.draftAssets[1].label = "Subisce il diritto di swap con AAA";

    const after = applyValidatedTrade(before, {
      playerMoves: [],
      pickMoves: [],
      pickClauses: [{ subjectIndex: 0, counterpartyIndex: 1, clause: "protected_top_5" }],
      existingClauseChanges: [{ subjectIndex: 0, counterpartyIndex: 1, clause: null }],
      qualifyingOfferMoves: [],
      cuts: [],
    });

    expect(after.draftAssets[0].label).toContain("Protetta top 5");
    expect(after.draftAssets[1].label).toContain("Contropartita se");
    expect(after.draftAssets[0].clauseResolution?.role).toBe("protected");
  });

  it("riconosce anche gli accordi importati dal vecchio foglio come testo", () => {
    const before = state();
    before.draftAssets[0].label = "Protetta top 5, 1a 2027 BBB";
    before.draftAssets[1].label = "C.p. se 1a 2027 AAA in top 5";
    const agreements = existingTradeClauseAgreements(before.draftAssets, ["AAA", "BBB"]);

    expect(agreements).toHaveLength(1);
    expect(agreements[0]).toMatchObject({
      clause: "protected_top_5",
      subjectOwnerTeamCode: "AAA",
      counterpartyOwnerTeamCode: "BBB",
    });
  });
});
