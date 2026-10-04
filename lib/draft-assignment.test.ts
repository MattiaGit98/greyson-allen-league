import { describe, expect, it } from "vitest";
import type { EditableLeagueState } from "./league-state";
import { buildDraftAssignment, defaultDraftDestinationForPrice, draftDestinationsForPrice } from "./draft-assignment";

function state(): EditableLeagueState {
  return {
    teams: [{
      code: "AAA", name: "Alpha", owner: "Owner", credits: 1000, cost: 0, players: 0,
      cutPlayers: 0, qualifyingOffers: 0, draftAssets: 2, nextSeasonCredits: 1000,
      followingSeasonCredits: 1000, slug: "aaa",
    }],
    rosterEntries: [],
    qualifyingOfferRights: [],
    draftAssets: [
      { label: "Scelta", round: "1° giro", year: 2026, originOrOverall: 7, teamCode: "AAA", draftCost: 10 },
      { label: "Scelta", round: "2° giro", year: 2026, originOrOverall: 15, teamCode: "AAA", draftCost: 1 },
    ],
    playerList: [
      { name: "Rookie Uno", role: "G", realTeam: "ROM", rookie: true, under23: true },
      { name: "Rookie Due", role: "A", realTeam: "MIL", rookie: true, under23: true },
    ],
    playerListStatus: "published",
  };
}

describe("assegnazione draft", () => {
  it("propone di default lo slot più basso consentito dal prezzo", () => {
    expect(defaultDraftDestinationForPrice(3)).toBe("g_league");
    expect(defaultDraftDestinationForPrice(7)).toBe("two_way");
    expect(defaultDraftDestinationForPrice(12)).toBe("regular");
    expect(draftDestinationsForPrice(7)).toEqual(["regular", "two_way"]);
    expect(draftDestinationsForPrice(12)).toEqual(["regular"]);
  });

  it("assegna prezzo e T.O. al roster e salva lo storico senza prezzo", () => {
    const result = buildDraftAssignment({
      state: state(), historyEntries: [], draftYear: 2026, pickIndex: 0, requestedPlayerName: "Rookie Uno", destinationSlot: "regular",
    });

    expect(result.price).toBe(10);
    expect(result.state.rosterEntries[0]).toMatchObject({
      name: "Rookie Uno", teamCode: "AAA", cost: 10, contract: "27 + T.O.", slot: "regular", state: "active",
    });
    expect(result.state.draftAssets).toHaveLength(1);
    const content = result.historyEntries[0].content;
    expect(content.kind).toBe("draft");
    if (content.kind !== "draft") throw new Error("contenuto inatteso");
    expect(content.rows[6]).toEqual({ pick: "7", team: "AAA", player: "Rookie Uno" });
    expect(content.rows[6]).not.toHaveProperty("price");
  });

  it("applica un credito a una scelta del secondo giro anche se numerata 15", () => {
    const first = buildDraftAssignment({
      state: state(), historyEntries: [], draftYear: 2026, pickIndex: 0, requestedPlayerName: "Rookie Uno", destinationSlot: "regular",
    });
    const result = buildDraftAssignment({
      state: first.state, historyEntries: first.historyEntries, draftYear: 2026, pickIndex: 0, requestedPlayerName: "Rookie Due", destinationSlot: "regular",
    });
    expect(result.price).toBe(1);
  });

  it("non permette di saltare una scelta ancora da assegnare", () => {
    expect(() => buildDraftAssignment({
      state: state(), historyEntries: [], draftYear: 2026, pickIndex: 1, requestedPlayerName: "Rookie Due", destinationSlot: "regular",
    })).toThrow(/scelta precedente/i);
  });

  it("rende ordinaria la contropartita del quarto draft al completamento del draft corrente", () => {
    const input = state();
    input.draftAssets.push({
      label: "Contropartita se la 1ª scelta 2026 AAA rientra in top 5",
      round: "1° giro",
      year: 2029,
      originOrOverall: "AAA",
      originTeamCode: "AAA",
      teamCode: "AAA",
    });
    const first = buildDraftAssignment({
      state: input, historyEntries: [], draftYear: 2026, pickIndex: 0, requestedPlayerName: "Rookie Uno", destinationSlot: "regular",
    });
    const second = buildDraftAssignment({
      state: first.state, historyEntries: first.historyEntries, draftYear: 2026, pickIndex: 0, requestedPlayerName: "Rookie Due", destinationSlot: "regular",
    });

    expect(second.draftCompleted).toBe(true);
    expect(second.state.draftAssets.filter((pick) => pick.year === 2029 && !pick.isBonus)).toHaveLength(2);
  });

  it("blocca le scelte ancora senza posizione numerica", () => {
    const input = state();
    input.draftAssets[0].originOrOverall = "AAA";
    expect(() => buildDraftAssignment({
      state: input, historyEntries: [], draftYear: 2026, pickIndex: 0, requestedPlayerName: "Rookie Uno", destinationSlot: "regular",
    })).toThrow(/posizione e costo/i);
  });

  it("blocca gli slot pieni e applica i limiti di prezzo degli slot speciali", () => {
    const input = state();
    input.rosterEntries = Array.from({ length: 15 }, (_, index) => ({
      name: `Veterano ${index}`,
      role: "G" as const,
      cost: 1,
      contract: "27",
      state: "active" as const,
      slot: "regular" as const,
      teamCode: "AAA",
    }));
    expect(() => buildDraftAssignment({
      state: input, historyEntries: [], draftYear: 2026, pickIndex: 0, requestedPlayerName: "Rookie Uno", destinationSlot: "regular",
    })).toThrow(/slot Roster è pieno/i);
    expect(() => buildDraftAssignment({
      state: state(), historyEntries: [], draftYear: 2026, pickIndex: 0, requestedPlayerName: "Rookie Uno", destinationSlot: "g_league",
    })).toThrow(/fino a 5 crediti/i);
  });

  it("blocca il draft anche se il conflitto è in uno slot diverso da quello scelto", () => {
    const input = state();
    input.rosterEntries = Array.from({ length: 2 }, (_, index) => ({
      name: `DPE ${index}`,
      role: "G" as const,
      cost: 1,
      contract: "27",
      state: "active" as const,
      slot: "dpe" as const,
      teamCode: "AAA",
    }));
    expect(() => buildDraftAssignment({
      state: input, historyEntries: [], draftYear: 2026, pickIndex: 0, requestedPlayerName: "Rookie Uno", destinationSlot: "regular",
    })).toThrow(/DPE.*oltre il limite/i);
  });

  it("completa progressivamente il draft e genera le scelte tra tre anni", () => {
    const first = buildDraftAssignment({
      state: state(), historyEntries: [], draftYear: 2026, pickIndex: 0, requestedPlayerName: "Rookie Uno", destinationSlot: "two_way",
    });
    expect(first.draftCompleted).toBe(false);
    expect(first.assignedPickCount).toBe(1);
    const second = buildDraftAssignment({
      state: first.state, historyEntries: first.historyEntries, draftYear: 2026, pickIndex: 0, requestedPlayerName: "Rookie Due", destinationSlot: "g_league",
    });
    expect(second.draftCompleted).toBe(true);
    expect(second.assignedPickCount).toBe(2);
    expect(second.expectedPickCount).toBe(2);
    expect(second.futureDraftYear).toBe(2029);
    expect(second.futurePicksAdded).toBe(2);
    expect(second.state.draftAssets).toEqual(expect.arrayContaining([
      expect.objectContaining({ year: 2029, round: "1° giro", originTeamCode: "AAA", teamCode: "AAA" }),
      expect.objectContaining({ year: 2029, round: "2° giro", originTeamCode: "AAA", teamCode: "AAA" }),
    ]));
    expect(second.historyEntries[0].content).toMatchObject({ kind: "draft" });
  });

  it("taglia immediatamente una scelta del primo giro con contratto annuale", () => {
    const result = buildDraftAssignment({
      state: state(), historyEntries: [], draftYear: 2026, pickIndex: 0, requestedPlayerName: "Rookie Uno", destinationSlot: "immediate_cut",
    });
    expect(result.state.rosterEntries[0]).toMatchObject({
      name: "Rookie Uno", state: "cut", slot: "regular", contract: "27", cost: 10,
    });
    expect(result.historyEntries[0].content).toMatchObject({ kind: "draft" });
  });

  it("registra il rilascio immediato del secondo giro tra i tagliati a costo zero", () => {
    const first = buildDraftAssignment({
      state: state(), historyEntries: [], draftYear: 2026, pickIndex: 0, requestedPlayerName: "Rookie Uno", destinationSlot: "regular",
    });
    const result = buildDraftAssignment({
      state: first.state, historyEntries: first.historyEntries, draftYear: 2026, pickIndex: 0, requestedPlayerName: "Rookie Due", destinationSlot: "immediate_release",
    });
    expect(result.state.rosterEntries).toHaveLength(first.state.rosterEntries.length + 1);
    expect(result.state.rosterEntries.at(-1)).toMatchObject({
      name: "Rookie Due", state: "cut", slot: "regular", contract: "27", cost: 0,
    });
    expect(result.state.draftAssets.some((pick) => pick.year === 2026)).toBe(false);
    const content = result.historyEntries[0].content;
    expect(content.kind).toBe("draft");
    if (content.kind === "draft") expect(content.rows[14]).toEqual({ pick: "15", team: "AAA", player: "Rookie Due" });
  });

  it("determina taglio o rilascio immediato dal prezzo, non dal giro", () => {
    const releaseInput = state();
    releaseInput.draftAssets[0].draftCost = 1;
    const released = buildDraftAssignment({
      state: releaseInput, historyEntries: [], draftYear: 2026, pickIndex: 0, requestedPlayerName: "Rookie Uno", destinationSlot: "immediate_release",
    });
    expect(released.state.rosterEntries).toHaveLength(1);
    expect(released.state.rosterEntries[0]).toMatchObject({ state: "cut", contract: "27", cost: 0 });

    const cutInput = state();
    cutInput.draftAssets[1].draftCost = 2;
    const first = buildDraftAssignment({
      state: cutInput, historyEntries: [], draftYear: 2026, pickIndex: 0, requestedPlayerName: "Rookie Uno", destinationSlot: "regular",
    });
    const cut = buildDraftAssignment({
      state: first.state, historyEntries: first.historyEntries, draftYear: 2026, pickIndex: 0, requestedPlayerName: "Rookie Due", destinationSlot: "immediate_cut",
    });
    expect(cut.state.rosterEntries.at(-1)).toMatchObject({ state: "cut", contract: "27", cost: 2 });
  });
});
