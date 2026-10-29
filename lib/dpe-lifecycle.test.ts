import { describe, expect, it } from "vitest";
import type { RosterEntry } from "./league-types";
import { emptyLeagueState } from "./league-state";
import { applyDpeActivation, applyEarlyDpeReintegration } from "./dpe-operations";
import { canReintegrateDpe, entriesForDpeAdjustedCap, shouldShowDpeBadge, shouldShowDpeNoReintegrationBadge } from "./dpe-rules";
import { calculateCapSpace } from "./season-time";
import { calculateLeagueAdvance } from "./league-advance";
import { freeReleaseReasonAvailability } from "./free-release";
import { applyValidatedTrade } from "./trade-state";
import { buildMovementReversal, movementReversalCapErrors, movementReversalSlotErrors } from "./league-movements";
import { buildPreAdvanceChecklist } from "./pre-advance-alerts";
import { roleMinimumShortage } from "./role-minimums";
import { evaluateTrade } from "./rules/trade";
import { evaluateFreeAgentSigning } from "./rules/free-agent";
import { renderStaticLeagueHtml } from "./static-league-html";
import { emptyHistoryCompetitionMap } from "./history-competitions";
import { applyContextualContractCut } from "./stretch-provision";

function player(name: string, patch: Partial<RosterEntry> = {}): RosterEntry {
  return { name, cost: 20, contract: "28", role: "G", state: "active", slot: "regular", teamCode: "AAA", ...patch };
}

const team = { code: "AAA", name: "Alpha", owner: "A", credits: 0, cost: 0, players: 0, cutPlayers: 0,
  qualifyingOffers: 0, draftAssets: 0, nextSeasonCredits: 0, followingSeasonCredits: 0, slug: "aaa" };

function state(entries: RosterEntry[]) {
  return { ...emptyLeagueState(), teams: [team], rosterEntries: entries };
}

function cap(entries: RosterEntry[], distance = 0) {
  return calculateCapSpace({ entries: entriesForDpeAdjustedCap(entries, distance),
    seasonName: distance ? "2027/28" : "2026/27", optionSeasonName: "2026/27", countTeamOptions: true });
}

describe("regressioni DPE lungo il ciclo della lega", () => {
  it("conserva il blocco nei trasferimenti e negli annullamenti e lo sostituisce solo a fine stagione col marchio DPE", () => {
    const before = state([player("DPE tardiva", { contract: "28" })]);
    const activated = applyDpeActivation({ rosterEntries: before.rosterEntries, teamCode: "AAA", playerName: "DPE tardiva", seasonName: "2026/27", leagueMoment: "trade_deadline" });
    const after = { ...before, rosterEntries: activated };
    expect(shouldShowDpeNoReintegrationBadge(activated[0], "trade_deadline")).toBe(true);
    const undone = buildMovementReversal(after, before, after);
    expect(undone.rosterEntries[0].dpeActivatedAfterDeadline).toBeUndefined();
    const redone = buildMovementReversal(undone, after, before);
    expect(canReintegrateDpe(redone.rosterEntries[0], "trade_deadline")).toBe(false);
    // Rettifica/trasferimento di proprietà: non cambia il periodo di DPE in essere.
    const transferred = applyValidatedTrade(after, { playerMoves: [{ stateIndex: 0, toTeamCode: "BBB", destinationSlot: "dpe" }], pickMoves: [], pickClauses: [], existingClauseChanges: [], qualifyingOfferMoves: [], cuts: [] });
    const late = transferred.rosterEntries[0];
    expect(late).toMatchObject({ teamCode: "BBB", dpeActivatedAfterDeadline: true });
    expect(shouldShowDpeNoReintegrationBadge(late, "free_agency_end")).toBe(false);
    const cut = applyContextualContractCut(late, 2027, "trade_deadline");
    expect(cut.dpeActivatedAfterDeadline).toBeUndefined();
    expect(shouldShowDpeNoReintegrationBadge(cut, "trade_deadline")).toBe(false);
    const advanced = calculateLeagueAdvance({ ...transferred, seasonName: "2026/27" });
    const automatic = advanced.rosterEntries[0];
    expect(automatic).toMatchObject({ slot: "regular", dpeSeasonEndReintegratedSeasons: ["2026/27"] });
    expect(automatic.dpeActivatedAfterDeadline).toBeUndefined();
    expect(shouldShowDpeBadge(automatic, "2027/28", "offseason_start")).toBe(true);
    expect(shouldShowDpeNoReintegrationBadge(automatic, "offseason_start")).toBe(false);
    expect(freeReleaseReasonAvailability("under_half_games", "offseason_start", automatic, "2027/28").available).toBe(false);
  });
  it("esenta tutte le DPE solo dal cap corrente e restituisce solo il costo del reintegrato", () => {
    const entries = [player("DPE 1", { slot: "dpe", cost: 100 }), player("DPE 2", { slot: "dpe", cost: 40 }), player("Roster")];
    expect(cap(entries)).toBe(980);
    expect(cap(entries, 1)).toBe(840);
    const after = applyEarlyDpeReintegration({ rosterEntries: entries, teamCode: "AAA", playerName: "DPE 2",
      seasonName: "2026/27", leagueMoment: "trade_deadline" });
    expect(cap(after)).toBe(940);
    expect(cap(after, 1)).toBe(840);
  });

  it("applica i controlli di cap anche all'annullamento di una DPE senza sacrificare le altre", () => {
    const before = state([player("Infortunato", { cost: 200 }), player("Altra DPE", { slot: "dpe" })]);
    const activated = applyDpeActivation({ rosterEntries: before.rosterEntries, teamCode: "AAA",
      playerName: "Infortunato", seasonName: "2026/27", leagueMoment: "contract_delivery" });
    const after = { ...before, rosterEntries: activated };
    const current = { ...after, rosterEntries: [...after.rosterEntries, player("Acquisto successivo", { cost: 1000, contract: "27" })] };
    const restored = buildMovementReversal(current, before, after);
    expect(restored.rosterEntries.find((entry) => entry.name === "Altra DPE")?.slot).toBe("dpe");
    expect(movementReversalSlotErrors(current, restored)).toEqual([]);
    expect(movementReversalCapErrors(current, restored, { seasonName: "2026/27", phase: "regular_season",
      teamOptionsResolved: true, currentMoment: "contract_delivery" }).length).toBeGreaterThan(0);
    expect(buildMovementReversal(restored, after, before).rosterEntries.find((entry) => entry.name === "Infortunato"))
      .toMatchObject({ slot: "dpe", dpeAppliedSeasons: ["2026/27"] });
  });

  it("distingue il reintegro anticipato da quello automatico anche dopo uno scambio", () => {
    const entries = [player("Anticipato", { slot: "dpe", contract: "29" }), player("Automatico", { slot: "dpe", contract: "29" })];
    for (const entry of entries) expect(shouldShowDpeBadge(entry, "2026/27", "free_agency_end")).toBe(false);
    const early = applyEarlyDpeReintegration({ rosterEntries: entries, teamCode: "AAA", playerName: "Anticipato",
      seasonName: "2026/27", leagueMoment: "trade_deadline" });
    const advanced = calculateLeagueAdvance({ ...state(early), seasonName: "2026/27" });
    expect(shouldShowDpeBadge(advanced.rosterEntries[0], "2027/28", "offseason_start")).toBe(false);
    expect(shouldShowDpeBadge(advanced.rosterEntries[1], "2027/28", "offseason_start")).toBe(true);
    const traded = applyValidatedTrade(state(advanced.rosterEntries), {
      playerMoves: [{ stateIndex: 0, toTeamCode: "BBB", destinationSlot: "regular" }, { stateIndex: 1, toTeamCode: "BBB", destinationSlot: "regular" }],
      pickMoves: [], pickClauses: [], existingClauseChanges: [], qualifyingOfferMoves: [], cuts: [],
    });
    const [earlyPlayer, automaticPlayer] = traded.rosterEntries;
    expect(earlyPlayer.dpeSeasonEndReintegratedSeasons).toBeUndefined();
    expect(automaticPlayer.dpeSeasonEndReintegratedSeasons).toEqual(["2026/27"]);
    expect(freeReleaseReasonAvailability("under_half_games", "team_option_deadline", earlyPlayer, "2027/28").available).toBe(true);
    expect(freeReleaseReasonAvailability("under_half_games", "team_option_deadline", automaticPlayer, "2027/28").available).toBe(false);
    expect(freeReleaseReasonAvailability("no_nba_roster", "team_option_deadline", automaticPlayer, "2027/28").available).toBe(true);
    expect(shouldShowDpeBadge(earlyPlayer, "2027/28", "team_option_deadline")).toBe(false);
    expect(shouldShowDpeBadge(automaticPlayer, "2027/28", "team_option_deadline")).toBe(true);
    for (const entry of traded.rosterEntries) {
      expect(shouldShowDpeBadge(entry, "2027/28", "auction_start")).toBe(false);
    }
    const following = calculateLeagueAdvance({ ...state(traded.rosterEntries), seasonName: "2027/28" });
    expect(freeReleaseReasonAvailability("under_half_games", "offseason_start", following.rosterEntries[1], "2028/29").available).toBe(true);
  });

  it("blocca la fine stagione se più reintegri superano 15, finché i tagli programmati non bastano", () => {
    const entries = [...Array.from({ length: 15 }, (_, i) => player(`Roster ${i}`, { cost: 1 })),
      player("DPE 1", { slot: "dpe" }), player("DPE 2", { slot: "dpe" }), player("Scade", { slot: "dpe", contract: "27" })];
    const input = { ...state(entries), seasonName: "2026/27" };
    expect(calculateLeagueAdvance(input).remainingOverflowByTeam).toEqual({ AAA: 2 });
    const checklist = (rosterEntries: RosterEntry[]) => buildPreAdvanceChecklist({ currentMoment: "free_agency_reopening", seasonName: "2026/27", state: state(rosterEntries) });
    expect(checklist(entries).alerts.find((alert) => alert.id === "blocked-offseason-roster-moves")?.tone).toBe("blocker");
    const planned = entries.map((entry) => ["Roster 0", "DPE 2"].includes(entry.name) ? { ...entry, scheduledSeasonEndCut: "2026/27" } : entry);
    const advanced = calculateLeagueAdvance({ ...input, rosterEntries: planned });
    expect(advanced.remainingOverflowByTeam).toEqual({});
    expect(advanced.reintegratedDpePlayers).toEqual([{ playerName: "DPE 1", teamCode: "AAA" }]);
    expect(advanced.rosterEntries.find((entry) => entry.name === "DPE 1")?.dpeSeasonEndReintegratedSeasons).toEqual(["2026/27"]);
    expect(advanced.rosterEntries.find((entry) => entry.name === "DPE 2")).toMatchObject({ state: "cut", slot: "regular" });
    expect(shouldShowDpeBadge(advanced.rosterEntries.find((entry) => entry.name === "DPE 2")!, "2027/28", "offseason_start")).toBe(false);
    expect(advanced.rosterEntries.some((entry) => entry.name === "Scade")).toBe(false);
    expect(checklist(planned).alerts.find((alert) => alert.id === "slot-overflows")).toBeUndefined();
    expect(checklist(planned).alerts.find((alert) => alert.id === "blocked-offseason-roster-moves")).toBeUndefined();
  });

  it("conta tutte le DPE nei ruoli soltanto dalla Riapertura free agency", () => {
    const entries = [player("G1", { slot: "dpe" }), player("G2", { slot: "dpe" }), player("A1", { role: "A", slot: "dpe" })];
    expect(roleMinimumShortage(entries, "regular_season", "free_agency_end")).toEqual({ G: 5, A: 5, C: 3, total: 13 });
    expect(roleMinimumShortage(entries, "regular_season", "free_agency_reopening")).toEqual({ G: 3, A: 4, C: 3, total: 10 });
  });

  it("scambi e free agent non rifiutano una squadra solo perché possiede più DPE", () => {
    const trade = evaluateTrade({ phase: "offseason", teams: ["AAA", "BBB"].map((code) => ({ code, currentCost: 100,
      slots: { regular: 1, twoWay: 0, gLeague: 0, dpe: 4 }, roles: { G: 1, A: 0, C: 0 } })),
      playerMoves: [{ id: "dpe", fromTeamCode: "AAA", toTeamCode: "BBB", cost: 20, capCost: 20, role: "G", sourceSlot: "dpe", destinationSlot: "dpe" }],
      pickMoves: [], cuts: [] });
    expect(trade.errors.filter((error) => error.code.startsWith("SLOT_"))).toEqual([]);
    expect(trade.calculated.teamResults.find((result) => result.code === "BBB")?.slots.dpe).toBe(5);
    const signing = evaluateFreeAgentSigning({ phase: "regular_season", enforceRoleMinimums: false, currentCost: 100,
      price: 1, destination: "regular", slots: { regular: 1, twoWay: 0, gLeague: 0, dpe: 4 }, playerSelected: true,
      playerAlreadyOwned: false, qualifyingOfferActive: false, roles: { G: 1, A: 0, C: 0 }, playerRole: "G", cutRole: null, cutSlot: null });
    expect(signing.errors.filter((error) => error.code.startsWith("SLOT_"))).toEqual([]);
  });

  it("allinea anche il cap e i ruoli della copia HTML alle DPE multiple", () => {
    const input = { ...state([player("DPE 1", { slot: "dpe", cost: 100 }), player("DPE 2", { slot: "dpe", role: "A", cost: 50 })]),
      exportedAt: new Date("2026-10-28T12:00:00Z"), seasonName: "2026/27", phaseName: "Stagione", countTeamOptions: true,
      history: emptyHistoryCompetitionMap() };
    const html = renderStaticLeagueHtml({ ...input, leagueMoment: "contract_delivery" });
    expect(html).toContain("Cap libero 2026/27</span><strong>1000</strong>");
    expect(html).toContain("Cap libero 2027/28</span><b>850</b>");
    expect(html).toContain("0 G / 0 A / 0 C");
    const reopened = renderStaticLeagueHtml({ ...input, leagueMoment: "free_agency_reopening" });
    expect(reopened).toContain("1 G / 1 A / 0 C");
    const lateInput = { ...input, rosterEntries: input.rosterEntries.map((entry) => ({ ...entry, dpeActivatedAfterDeadline: true })) };
    expect(renderStaticLeagueHtml({ ...lateInput, leagueMoment: "trade_deadline" })).toContain("DPE 1 · NO R.");
    expect(renderStaticLeagueHtml({ ...lateInput, leagueMoment: "free_agency_end" })).not.toContain("NO R.");
  });
});
