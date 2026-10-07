import { describe, expect, it } from "vitest";
import {
  buildMovementReversal,
  draftChoiceBelongsToSeason,
  movementReversalCapErrors,
  movementReversalSlotErrors,
  movementUndoMetadataFromState,
  movementUndoWindowError,
} from "./league-movements";
import type { EditableLeagueState } from "./league-state";

function state(teamCode: string): EditableLeagueState {
  return {
    teams: [], draftAssets: [], qualifyingOfferRights: [], playerList: [], playerListStatus: "published",
    rosterEntries: [{ name: "Player", teamCode, cost: 10, contract: "28", state: "active", slot: "regular" }],
  };
}

describe("movement reversal", () => {
  it("restores a traded player when the affected player is unchanged", () => {
    const before = state("AAA");
    const after = state("BBB");
    const current = { ...after, qualifyingOfferRights: [{ playerName: "Other", teamCode: "CCC", qualifyingAmount: 1 }] };
    expect(buildMovementReversal(current, before, after).rosterEntries[0].teamCode).toBe("AAA");
    expect(buildMovementReversal(current, before, after).qualifyingOfferRights).toHaveLength(1);
  });

  it("reverses compact snapshots without touching unrelated players or losing the second reversal", () => {
    const before = state("AAA");
    const after = state("BBB");
    const unrelated = { name: "Other", teamCode: "CCC", cost: 8, contract: "28", state: "active" as const, slot: "regular" as const };
    const current = { ...after, rosterEntries: [...after.rosterEntries, unrelated] };
    const compactBefore = { ...before, rosterEntries: [before.rosterEntries[0]] };
    const compactAfter = { ...after, rosterEntries: [after.rosterEntries[0]] };

    const restored = buildMovementReversal(current, compactBefore, compactAfter);
    expect(restored.rosterEntries).toContainEqual(before.rosterEntries[0]);
    expect(restored.rosterEntries).toContainEqual(unrelated);
    expect(buildMovementReversal(restored, compactAfter, compactBefore).rosterEntries).toEqual(current.rosterEntries);
  });

  it("allows an ordinary team-option reversal only before its deadline", () => {
    const input = {
      operationType: "team_option",
      movementSeasonName: "2026/27",
      undoBeforeMoment: "team_option_deadline",
      currentSeasonName: "2026/27",
    } as const;
    expect(movementUndoWindowError({ ...input, currentMoment: "offseason_start" })).toBeNull();
    expect(movementUndoWindowError({ ...input, currentMoment: "team_option_deadline" })).toMatch(/non sono più annullabili/);
  });

  it("does not reopen an old team-option reversal in the next offseason", () => {
    expect(movementUndoWindowError({
      operationType: "team_option",
      movementSeasonName: "2026/27",
      undoBeforeMoment: "team_option_deadline",
      currentSeasonName: "2027/28",
      currentMoment: "offseason_start",
    })).toMatch(/non sono più annullabili/);
  });

  it("consente di annullare la segnalazione playoff solo prima della riapertura free agency", () => {
    const input = {
      operationType: "team_option_playoff",
      movementSeasonName: "2026/27",
      undoBeforeMoment: "free_agency_reopening",
      currentSeasonName: "2026/27",
    } as const;
    expect(movementUndoWindowError({ ...input, currentMoment: "free_agency_end" })).toBeNull();
    expect(movementUndoWindowError({ ...input, currentMoment: "free_agency_reopening" })).toMatch(/non è più annullabile/);
  });

  it("blocks a legacy team-option movement when its season cannot be identified", () => {
    expect(movementUndoWindowError({
      operationType: "team_option",
      movementSeasonName: null,
      undoBeforeMoment: null,
      currentSeasonName: "2026/27",
      currentMoment: "offseason_start",
    })).toMatch(/non contiene l'annata/);
  });

  it("never allows the definitive Draft order to be reversed", () => {
    expect(movementUndoWindowError({
      operationType: "ordine_draft_finale",
      movementSeasonName: null,
      undoBeforeMoment: null,
      currentSeasonName: "2026/27",
      currentMoment: "offseason_start",
    })).toMatch(/non può essere annullato/);
  });

  it("allows only the latest Draft selection before the auction starts", () => {
    const input = {
      operationType: "scelta_draft",
      movementSeasonName: null,
      undoBeforeMoment: null,
      currentSeasonName: "2026/27",
      currentMoment: "team_option_deadline",
    } as const;
    expect(movementUndoWindowError({ ...input, isLatestDraftChoice: false })).toMatch(/soltanto l'ultima scelta/i);
    expect(movementUndoWindowError({ ...input, isLatestDraftChoice: true })).toBeNull();
    expect(movementUndoWindowError({ ...input, currentMoment: "auction_start", isLatestDraftChoice: true }))
      .toMatch(/Inizio asta/i);
  });

  it("recognizes the season of legacy Draft movements from their history snapshot", () => {
    const afterHistory = [{
      season: "2026",
      content: { kind: "draft", rows: [{ player: "Rookie", team: "AAA" }] },
    }];
    expect(draftChoiceBelongsToSeason(null, afterHistory, "2026/27")).toBe(true);
    expect(draftChoiceBelongsToSeason(null, afterHistory, "2027/28")).toBe(false);
    expect(draftChoiceBelongsToSeason("2027/28", afterHistory, "2027/28")).toBe(true);
  });

  it("does not reopen a reversed Draft selection after the auction starts", () => {
    expect(movementUndoWindowError({
      operationType: "movimento_annullato",
      movementSeasonName: "2026/27",
      undoBeforeMoment: "auction_start",
      currentSeasonName: "2026/27",
      currentMoment: "auction_start",
    })).toMatch(/annullamento del Draft.*Inizio asta/i);
  });

  it("allows an auction assignment reversal only while the auction is open", () => {
    const input = {
      operationType: "acquisto_asta",
      movementSeasonName: "2026/27",
      undoBeforeMoment: null,
      currentSeasonName: "2026/27",
    } as const;
    expect(movementUndoWindowError({ ...input, currentMoment: "auction_start" })).toBeNull();
    expect(movementUndoWindowError({ ...input, currentMoment: "auction_completed" })).toMatch(/Termine asta/);
  });

  it("restores the qualifying offer when its auction assignment is reversed", () => {
    const before = state("AAA");
    before.rosterEntries = [];
    before.qualifyingOfferRights = [{ playerName: "Player", teamCode: "AAA", qualifyingAmount: 7 }];
    const after = state("AAA");
    after.rosterEntries[0] = {
      ...after.rosterEntries[0],
      cost: 7,
      contract: "27",
      auctionAcquisition: "qualifying_offer",
      auctionPrice: 7,
      contractStartSeason: "2026/27",
      originalContractYears: 1,
    };

    const restored = buildMovementReversal(after, before, after);
    expect(restored.rosterEntries).toEqual([]);
    expect(restored.qualifyingOfferRights).toEqual(before.qualifyingOfferRights);
  });

  it("recovers movement undo metadata preserved inside backup snapshots", () => {
    expect(movementUndoMetadataFromState({
      rosterEntries: [],
      _movementMeta: { season_name: "2026/27", undo_before_moment: "team_option_deadline" },
    })).toEqual({ seasonName: "2026/27", undoBeforeMoment: "team_option_deadline" });
  });

  it("blocks reversal after the same player moves again", () => {
    expect(() => buildMovementReversal(state("CCC"), state("AAA"), state("BBB"))).toThrow(/modificati successivamente/);
  });

  it("removes a player that was added to the list by the reverted movement", () => {
    const before = state("AAA");
    const addedPlayer = { name: "Nuovo Player", role: "G" as const, realTeam: "BOS", rookie: false, under23: false };
    const after = { ...state("BBB"), playerList: [addedPlayer] };
    const restored = buildMovementReversal(after, before, after);
    expect(restored.playerList).toEqual([]);
  });

  it("blocks reversal when the automatically added list row was later edited", () => {
    const before = state("AAA");
    const addedPlayer = { name: "Nuovo Player", role: "G" as const, realTeam: "BOS", rookie: false, under23: false };
    const after = { ...state("BBB"), playerList: [addedPlayer] };
    const current = { ...after, playerList: [{ ...addedPlayer, realTeam: "NYK" }] };
    expect(() => buildMovementReversal(current, before, after)).toThrow(/listone.*modificati successivamente/);
  });

  it("reorders every restored roster block by descending cost", () => {
    const before = state("AAA");
    before.rosterEntries = [
      { name: "Low", teamCode: "AAA", cost: 5, contract: "28", state: "active", slot: "regular" },
      { name: "Player", teamCode: "AAA", cost: 10, contract: "28", state: "active", slot: "regular" },
      { name: "High", teamCode: "AAA", cost: 20, contract: "28", state: "active", slot: "regular" },
    ];
    const after = { ...before, rosterEntries: before.rosterEntries.filter((entry) => entry.name !== "Player") };
    const restored = buildMovementReversal(after, before, after);

    expect(restored.rosterEntries.map((entry) => entry.name)).toEqual(["High", "Player", "Low"]);
  });

  it("reports a slot conflict before restoring a player", () => {
    const regularPlayer = (index: number) => ({
      name: `Player ${index}`,
      teamCode: "AAA",
      cost: index,
      contract: "28",
      state: "active" as const,
      slot: "regular" as const,
    });
    const before = state("AAA");
    before.rosterEntries = Array.from({ length: 16 }, (_, index) => regularPlayer(index + 1));
    const after = { ...before, rosterEntries: before.rosterEntries.slice(0, 15) };
    const restored = buildMovementReversal(after, before, after);

    expect(movementReversalSlotErrors(after, restored)).toEqual([
      "AAA: slot Roster oltre il limite (16/15).",
    ]);
  });

  it("blocks a reversal that would increase an over-cap offseason roster", () => {
    const current = state("AAA");
    current.rosterEntries[0].cost = 999;
    const restored = state("AAA");
    restored.rosterEntries[0].cost = 1001;

    expect(movementReversalCapErrors(current, restored, {
      seasonName: "2026/27",
      phase: "offseason",
      teamOptionsResolved: false,
      currentMoment: "offseason_start",
    })).toEqual([
      "AAA: Il cap libero 2026/27 sarebbe -1 (limite 1000).",
      "AAA: Il cap libero 2027/28 sarebbe -1 (limite 1000).",
    ]);
  });
});
