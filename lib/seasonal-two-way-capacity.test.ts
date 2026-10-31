import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { RosterEntry } from "./league-types";
import { emptyLeagueState, normalizeState } from "./league-state";
import { getRosterSlotLimits, findTeamSlotOverflows } from "./roster-slot-limits";
import { calculateLeagueAdvance } from "./league-advance";
import { applyFreeAgencyEnd, buildLeagueTransitionPreview } from "./league-transition";
import { roleMinimumRecoverySlotError } from "./role-minimums";
import { resolveContextualSlots } from "./contextual-slot-resolution";
import { evaluateFreeAgentSigning } from "./rules/free-agent";
import { evaluateTrade } from "./rules/trade";
import { buildDraftAssignment } from "./draft-assignment";
import { persistLeagueMovement, movementReversalSlotErrors, buildMovementReversal } from "./league-movements";
import { buildPreAdvanceChecklist } from "./pre-advance-alerts";
import { movementReversalPreview } from "./movement-reversal-preview";
import { buildPublicLeagueContext } from "./public-league-context";
import { renderStaticLeagueHtml } from "./static-league-html";
import { emptyHistoryCompetitionMap } from "./history-competitions";

function fixture(twoWaySlotLimit?: number) {
  return { ...emptyLeagueState(), twoWaySlotLimit,
    teams: [{ code: "AAA", name: "Alpha", owner: "A", slug: "alpha", credits: 1000, cost: 0, players: 0,
      cutPlayers: 0, qualifyingOffers: 0, draftAssets: 0, nextSeasonCredits: 1000, followingSeasonCredits: 1000 }],
  };
}

function entry(index: number, slot: RosterEntry["slot"] = "two_way"): RosterEntry {
  return { name: `Player ${index}`, cost: 1, contract: "30 + T.O.", state: "active", slot, teamCode: "AAA", role: "G" };
}

describe("capacità Two-way stagionale senza dipendenze dall'annata", () => {
  it("mantiene due slot per gli stati precedenti e conserva il limite esplicito senza inventare giocatori", () => {
    expect(getRosterSlotLimits(normalizeState(fixture())).two_way).toBe(2);
    expect(getRosterSlotLimits(normalizeState(fixture(2))).two_way).toBe(2);
    expect(getRosterSlotLimits(normalizeState(fixture(3))).two_way).toBe(3);
    expect(normalizeState(fixture(3)).rosterEntries).toEqual([]);
    expect(() => normalizeState(fixture(4))).toThrow(/Two-way non valido/);
  });

  it.each(["2029/30", "2034/35"])("attiva tre slot alla Chiusura free agency di %s e li mantiene nelle annate successive", (seasonName) => {
    const initial = fixture(2);
    const after = applyFreeAgencyEnd(initial);
    expect(getRosterSlotLimits(after).two_way).toBe(3);
    expect(initial.twoWaySlotLimit).toBe(2);
    expect(after).toEqual({ ...initial, twoWaySlotLimit: 3 });
    const first = calculateLeagueAdvance({ ...after, seasonName });
    const second = calculateLeagueAdvance({ ...after, ...first, seasonName: first.nextSeasonName });
    expect(getRosterSlotLimits({ ...after, ...first, ...second }).two_way).toBe(3);
    const preview = buildLeagueTransitionPreview({ state: initial, currentMoment: "buyout_end", seasonName });
    expect(preview.automaticActions).toContain("Gli slot Two-way utilizzabili passeranno a 3 per squadra.");
    expect(buildLeagueTransitionPreview({ state: initial, currentMoment: "trade_deadline", seasonName }).automaticActions.join(" ")).not.toContain("Two-way");
    expect(buildLeagueTransitionPreview({ state: after, currentMoment: "buyout_end", seasonName }).automaticActions.join(" ")).not.toContain("Two-way");
    expect(buildLeagueTransitionPreview({ state: after, currentMoment: "free_agency_reopening", seasonName }).automaticActions.join(" ")).not.toContain("Two-way");
    const action = readFileSync("app/admin/impostazioni/actions.ts", "utf8");
    expect(action).toContain('if (transition === "free_agency_end") nextState = applyFreeAgencyEnd(nextState);');
    expect(action).toContain("next_state_payload: nextState");
    expect(action).not.toContain("twoWaySlotLimit: advance.twoWaySlotLimit");
    expect(action.slice(action.indexOf("async function performLeagueSeasonAdvance("))).not.toContain("twoWaySlotLimit:");
  });

  it.each([undefined, 2, 3])("Fine stagione conserva il limite esistente (%s) senza attivare slot", (twoWaySlotLimit) => {
    const state = fixture(twoWaySlotLimit);
    const advance = calculateLeagueAdvance({ ...state, seasonName: "2029/30" });
    expect(advance).not.toHaveProperty("twoWaySlotLimit");
    expect(getRosterSlotLimits({ ...state, ...advance }).two_way).toBe(getRosterSlotLimits(state).two_way);
    expect(buildLeagueTransitionPreview({ state, currentMoment: "free_agency_reopening", seasonName: "2029/30" }).automaticActions.join(" ")).not.toContain("Two-way");
  });

  it("la chiusura attiva anche gli stati precedenti ed è ripetibile senza cambiare i dati", () => {
    const legacy = fixture();
    const activated = applyFreeAgencyEnd(legacy);
    expect(activated).toEqual({ ...legacy, twoWaySlotLimit: 3 });
    expect(applyFreeAgencyEnd(activated)).toEqual(activated);
  });

  it("il terzo posto non è utilizzabile prima del cambio, il quarto resta sempre vietato", () => {
    const three = [entry(1), entry(2), entry(3)];
    expect(findTeamSlotOverflows(three, "AAA", fixture(2))[0]).toMatchObject({ slot: "two_way", limit: 2 });
    expect(findTeamSlotOverflows(three, "AAA", fixture(3))).toEqual([]);
    expect(findTeamSlotOverflows([...three, entry(4)], "AAA", fixture(3))[0].limit).toBe(3);
  });

  it("anche il salvataggio comune e gli annullamenti usano la capacità corrente, non quella dello snapshot", async () => {
    const before = { ...fixture(3), rosterEntries: [entry(1), entry(2)] };
    const after = { ...before, rosterEntries: [...before.rosterEntries, entry(3)] };
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await persistLeagueMovement({ rpc } as never, before, after, "test", "Test");
    expect(rpc).toHaveBeenCalledOnce();
    rpc.mockClear();
    await persistLeagueMovement({ rpc } as never, { ...before, twoWaySlotLimit: 2 }, after, "test", "Test");
    expect(rpc).not.toHaveBeenCalled();
    expect(movementReversalSlotErrors(before, after)).toEqual([]);
    expect(movementReversalSlotErrors({ ...before, twoWaySlotLimit: 2 }, after)).not.toEqual([]);
    const reversed = buildMovementReversal(after, { ...before, twoWaySlotLimit: 2 }, { ...after, twoWaySlotLimit: 2 });
    expect(reversed.twoWaySlotLimit).toBe(3);
    expect(movementReversalPreview({ current: after, restored: reversed, seasonName: "2029/30", countTeamOptions: true, currentMoment: "contract_delivery" })[0].twoWaySlotLimit).toBe(3);
  });

  it("la cascata non domanda un taglio se il terzo slot è effettivamente libero", () => {
    const input = { counts: { regular: 15, two_way: 2, g_league: 3 }, incomingSlot: "two_way" as const, players: [], decisions: [] };
    expect(resolveContextualSlots({ ...input, twoWaySlotLimit: 2 }).complete).toBe(false);
    const three = resolveContextualSlots({ ...input, twoWaySlotLimit: 3 });
    expect(three.complete).toBe(true);
    expect(three.operations).toEqual([]);
    expect(resolveContextualSlots({ ...input, twoWaySlotLimit: 3, counts: { ...input.counts, two_way: 3 } }).complete).toBe(false);
  });

  it("il terzo posto non può colmare una carenza di ruolo prima della sua attivazione", () => {
    const shortage = { G: 1, A: 0, C: 0, total: 1 };
    const full = { regular: 15, twoWay: 2 };
    expect(roleMinimumRecoverySlotError(shortage, full, fixture(2))).not.toBeNull();
    expect(roleMinimumRecoverySlotError(shortage, full, fixture(3))).toBeNull();
  });

  it("free agency e simulazione scambi applicano lo stesso limite dinamico", () => {
    const fa = { phase: "regular_season", currentCost: 200, price: 1, destination: "two_way" as const,
      slots: { regular: 15, twoWay: 2, gLeague: 0, dpe: 0 }, playerSelected: true, playerAlreadyOwned: false, qualifyingOfferActive: false,
      roles: { G: 5, A: 5, C: 3 }, playerRole: "G" as const, cutRole: null, cutSlot: null };
    expect(evaluateFreeAgentSigning({ ...fa, twoWaySlotLimit: 2 }).valid).toBe(false);
    expect(evaluateFreeAgentSigning({ ...fa, twoWaySlotLimit: 3 }).valid).toBe(true);
    const trade = { phase: "offseason", teams: ["AAA", "BBB"].map((code) => ({ code, currentCost: 200,
      slots: { regular: 15, twoWay: code === "AAA" ? 2 : 1, gLeague: 0, dpe: 0 }, roles: { G: 5, A: 5, C: 3 } })),
      playerMoves: [{ id: "incoming", fromTeamCode: "BBB", toTeamCode: "AAA", cost: 1, capCost: 1, role: "G" as const, sourceSlot: "two_way" as const, destinationSlot: "two_way" as const }], pickMoves: [], cuts: [] };
    expect(evaluateTrade({ ...trade, twoWaySlotLimit: 2 }).errors.some((error) => error.code.startsWith("SLOT_"))).toBe(true);
    expect(evaluateTrade({ ...trade, twoWaySlotLimit: 3 }).valid).toBe(true);
  });

  it("il draft può assegnare il terzo rookie Two-way soltanto quando la capacità è tre", () => {
    const state = { ...fixture(3), rosterEntries: [entry(1), entry(2)],
      draftAssets: [{ label: "Scelta", round: "1° giro", year: 2029, originOrOverall: 7, teamCode: "AAA", draftCost: 7 }, { label: "Scelta", round: "2° giro", year: 2029, originOrOverall: 15, teamCode: "AAA", draftCost: 1 }],
      playerList: [{ name: "Rookie", role: "A" as const, rookie: true, under23: false, realTeam: "" }] };
    const input = { state, historyEntries: [], draftYear: 2029, pickIndex: 0, requestedPlayerName: "Rookie", destinationSlot: "two_way" as const };
    expect(buildDraftAssignment(input).state.rosterEntries).toHaveLength(3);
    expect(() => buildDraftAssignment({ ...input, state: { ...state, twoWaySlotLimit: 2 } })).toThrow(/slot Two-way è pieno/);
  });

  it("avvisi ed esportazioni usano la capacità effettiva senza mostrare il posto futuro", () => {
    const state = { ...fixture(2), rosterEntries: [entry(1), entry(2), entry(3)] };
    expect(buildPreAdvanceChecklist({ state, currentMoment: "contract_delivery", seasonName: "2029/30" }).alerts.some((alert) => alert.id === "slot-overflows")).toBe(true);
    expect(buildPreAdvanceChecklist({ state: { ...state, twoWaySlotLimit: 3 }, currentMoment: "contract_delivery", seasonName: "2029/30" }).alerts.some((alert) => alert.id === "slot-overflows")).toBe(false);
    const season = { name: "2029/30", status: "regular_season" as const, timeline_moment: "contract_delivery", team_options_resolved: true };
    const context = buildPublicLeagueContext(fixture(2), season, []);
    expect(context.squadre[0]).toMatchObject({ slotTwoWayUtilizzabili: 2, twoWay: [] });
    expect(context.squadre[0]).not.toHaveProperty("terzoSlotTwoWay");
    const input = { ...fixture(2), exportedAt: new Date("2030-01-01"), seasonName: "2029/30", phaseName: "Stagione", leagueMoment: "contract_delivery" as const, countTeamOptions: true, history: emptyHistoryCompetitionMap() };
    expect(renderStaticLeagueHtml(input)).not.toContain("Disponibile dalla prossima stagione");
    expect(renderStaticLeagueHtml(input)).toContain("Two-way (0/2)");
    expect(renderStaticLeagueHtml({ ...input, twoWaySlotLimit: 3 })).toContain("Two-way (0/3)");
    expect(renderStaticLeagueHtml({ ...input, twoWaySlotLimit: 3 })).not.toContain("Disponibile dalla prossima stagione");
    expect(JSON.stringify(context.squadre[0].twoWay)).not.toContain("Prox.");
  });
});
