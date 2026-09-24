import { describe, expect, it } from "vitest";
import type { EditableLeagueState } from "./league-state";
import { buildSignAndTradeProvisional } from "./sign-and-trade";
import { applyValidatedTrade } from "./trade-state";

function team(code: string) {
  return { code, name: code, owner: code, credits: 0, cost: 0, players: 0, cutPlayers: 0, qualifyingOffers: 0, draftAssets: 0, nextSeasonCredits: 0, followingSeasonCredits: 0, slug: code.toLowerCase() };
}

function baseState(): EditableLeagueState {
  return {
    teams: [team("AAA"), team("BBB")],
    rosterEntries: Array.from({ length: 15 }, (_, index) => ({
      name: `Roster ${index + 1}`,
      role: index < 5 ? "G" as const : index < 10 ? "A" as const : "C" as const,
      cost: 10,
      contract: "27",
      state: "active" as const,
      slot: "regular" as const,
      teamCode: "AAA",
    })),
    draftAssets: [],
    qualifyingOfferRights: [],
    playerList: [
      ...Array.from({ length: 15 }, (_, index) => ({
        name: `Roster ${index + 1}`,
        role: index < 5 ? "G" as const : index < 10 ? "A" as const : "C" as const,
        realTeam: "ATL",
        rookie: false,
        under23: false,
      })),
      { name: "Free Agent", role: "G", realTeam: "BOS", rookie: false, under23: false },
    ],
    playerListStatus: "published",
  };
}

describe("sign and trade", () => {
  it("tollera lo slot provvisoriamente pieno ma permette di liberarlo nello stesso scambio", () => {
    const provisional = buildSignAndTradeProvisional({
      state: baseState(),
      request: {
        kind: "free_agent",
        playerSource: "list",
        playerName: "Free Agent",
        playerRole: "",
        realTeam: "",
        signerTeamCode: "AAA",
        price: 5,
        destinationSlot: "regular",
        buyoutTopSixConfirmed: false,
      },
      seasonName: "2026/27",
      phase: "regular_season",
      moment: "contract_delivery",
    });
    expect(provisional.state.rosterEntries.filter((entry) => entry.teamCode === "AAA" && entry.state === "active" && entry.slot === "regular")).toHaveLength(16);

    const finalState = applyValidatedTrade(provisional.state, {
      playerMoves: [{ stateIndex: 0, toTeamCode: "BBB", destinationSlot: "regular" }],
      pickMoves: [],
      pickClauses: [],
      existingClauseChanges: [],
      qualifyingOfferMoves: [],
      cuts: [],
    });
    expect(finalState.rosterEntries.filter((entry) => entry.teamCode === "AAA" && entry.state === "active" && entry.slot === "regular")).toHaveLength(15);
  });

  it("consente di coinvolgere nello scambio proprio il giocatore appena firmato", () => {
    const provisional = buildSignAndTradeProvisional({
      state: baseState(),
      request: {
        kind: "free_agent",
        playerSource: "list",
        playerName: "Free Agent",
        playerRole: "",
        realTeam: "",
        signerTeamCode: "AAA",
        price: 5,
        destinationSlot: "regular",
        buyoutTopSixConfirmed: false,
      },
      seasonName: "2026/27",
      phase: "regular_season",
      moment: "contract_delivery",
    });
    const signingIndex = provisional.state.rosterEntries.findIndex((entry) => entry.name === "Free Agent");
    const finalState = applyValidatedTrade(provisional.state, {
      playerMoves: [{ stateIndex: signingIndex, toTeamCode: "BBB", destinationSlot: "regular" }],
      pickMoves: [],
      pickClauses: [],
      existingClauseChanges: [],
      qualifyingOfferMoves: [],
      cuts: [],
    });

    expect(finalState.rosterEntries[signingIndex]).toMatchObject({
      name: "Free Agent",
      teamCode: "BBB",
      cost: 5,
      contract: "27 (Q)",
    });
  });

  it("non consente il sign and trade dopo la trade deadline", () => {
    expect(() => buildSignAndTradeProvisional({
      state: baseState(),
      request: {
        kind: "free_agent",
        playerSource: "list",
        playerName: "Free Agent",
        playerRole: "",
        realTeam: "",
        signerTeamCode: "AAA",
        price: 5,
        destinationSlot: "regular",
        buyoutTopSixConfirmed: false,
      },
      seasonName: "2026/27",
      phase: "regular_season",
      moment: "trade_deadline",
    })).toThrow("trade deadline");
  });

  it("aggiunge un giocatore fuori listone senza richiedere la squadra NBA", () => {
    const provisional = buildSignAndTradeProvisional({
      state: baseState(),
      request: {
        kind: "free_agent",
        playerSource: "outside",
        playerName: "Nuovo giocatore",
        playerRole: "G",
        realTeam: "",
        signerTeamCode: "AAA",
        price: 1,
        destinationSlot: "regular",
        buyoutTopSixConfirmed: false,
      },
      seasonName: "2026/27",
      phase: "regular_season",
      moment: "contract_delivery",
    });

    expect(provisional.state.playerList.at(-1)).toMatchObject({
      name: "Nuovo giocatore", role: "G", realTeam: "FA", rookie: false, under23: false,
    });
  });

  it("richiede anche nel sign and trade la verifica per un free agent soggetto a buyout", () => {
    const state = baseState();
    state.rosterEntries.push({
      name: "Free Agent",
      role: "G",
      cost: 20,
      contract: "27",
      state: "cut",
      slot: "regular",
      teamCode: "BBB",
      buyoutApplied: true,
    });
    const request = {
      kind: "free_agent" as const,
      playerSource: "list" as const,
      playerName: "Free Agent",
      playerRole: "" as const,
      realTeam: "",
      signerTeamCode: "AAA",
      price: 5,
      destinationSlot: "regular" as const,
      buyoutTopSixConfirmed: false,
    };

    expect(() => buildSignAndTradeProvisional({
      state,
      request,
      seasonName: "2026/27",
      phase: "regular_season",
      moment: "contract_delivery",
    })).toThrow("prime sei posizioni");

    expect(() => buildSignAndTradeProvisional({
      state,
      request: { ...request, buyoutTopSixConfirmed: true },
      seasonName: "2026/27",
      phase: "regular_season",
      moment: "contract_delivery",
    })).not.toThrow();
  });

});
