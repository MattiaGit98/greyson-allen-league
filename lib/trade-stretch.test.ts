import { describe, expect, it } from "vitest";
import type { RosterEntry } from "./league-types";
import { emptyLeagueState } from "./league-state";
import { tradeStretchContracts, hydrateTradeStretches, resolveTradeStretches, type TradeStretchRequest } from "./trade-stretch";
import { applyValidatedTrade } from "./trade-state";
import { evaluateTrade } from "./rules/trade";
import { calculateCapSpace } from "./season-time";
import { entriesForDpeAdjustedCap } from "./dpe-rules";
import { buildMovementReversal, movementReversalSlotErrors } from "./league-movements";

const cut: RosterEntry = { name: "Vecchio tagliato", cost: 300, contract: "27", teamCode: "AAA", state: "cut", slot: "regular" };
function request(entries = [cut], years: 2 | 3 = 3): TradeStretchRequest {
  const source = tradeStretchContracts(entries, "2026/27", true)[0];
  return { id: source.id, teamCode: source.teamCode, cost: source.cost, contract: source.contract, years };
}

describe("stretch dei contratti già tagliati nello scambio", () => {
  it("propone soltanto i contratti idonei e distingue anche nomi uguali", () => {
    const entries = [cut, { ...cut, cost: 31, contract: "28" }, { ...cut, state: "active" as const },
      { ...cut, buyoutApplied: true }, { ...cut, stretchProvisionApplied: true }, { ...cut, cost: 0 },
      { ...cut, contract: "29" }, { ...cut, contract: "26" }];
    const candidates = tradeStretchContracts(entries, "2026/27", true);
    expect(candidates).toHaveLength(2);
    expect(new Set(candidates.map((entry) => entry.id)).size).toBe(2);
    expect(candidates[0]).toMatchObject({ stretchOptions: [2, 3], residualCost: 300 });
    expect(candidates[1]).toMatchObject({ stretchOptions: [3], residualCost: 62, currentCapCost: 31 });
    expect(candidates[1].futureCapCosts).toEqual({ "2027/28": 31, "2028/29": 0 });
  });

  it("applica le rate corrette arrotondate per eccesso senza liberare slot o cambiare proprietario", () => {
    const entries = [{ ...cut, cost: 31, contract: "28" }];
    const resolved = resolveTradeStretches({ entries, requests: [request(entries)], participantCodes: ["AAA", "BBB"], seasonName: "2026/27", countTeamOptions: true });
    expect(resolved.changes[0].entry).toEqual({ ...entries[0], cost: 21, contract: "29", stretchProvisionApplied: true });
    const before = { ...emptyLeagueState(), rosterEntries: entries };
    const after = applyValidatedTrade(before, { playerMoves: [], pickMoves: [], pickClauses: [], qualifyingOfferMoves: [], existingClauseChanges: [], cuts: [], stretches: resolved.changes });
    expect(after.rosterEntries[0].state).toBe("cut");
    expect(after.rosterEntries[0].teamCode).toBe("AAA");
    expect(movementReversalSlotErrors(before, after)).toEqual([]);
    expect(entries[0].cost).toBe(31);
    expect(tradeStretchContracts(after.rosterEntries, "2026/27", true)).toEqual([]);
  });

  it("rifiuta duplicati, squadre estranee e contratti modificati dopo la simulazione", () => {
    const contracts = tradeStretchContracts([cut], "2026/27", true);
    const valid = request();
    for (const invalid of [{ ...valid, teamCode: "BBB" }, { ...valid, cost: 299 }, { ...valid, contract: "28" }, { ...valid, id: "non-esiste" }]) {
      expect(() => hydrateTradeStretches([invalid], contracts, ["AAA", "BBB"])).toThrow(/non è più valida/);
    }
    expect(() => hydrateTradeStretches([valid, valid], contracts, ["AAA", "BBB"])).toThrow(/non è più valida/);
    expect(() => hydrateTradeStretches([valid], contracts, ["BBB", "CCC"])).toThrow(/non è più valida/);
    expect(() => resolveTradeStretches({ entries: [{ ...cut, state: "active" }], requests: [valid], participantCodes: ["AAA", "BBB"], seasonName: "2026/27", countTeamOptions: true })).toThrow();
  });

  it("non permette due rate se restano due stagioni", () => {
    const entries = [{ ...cut, contract: "28" }];
    expect(() => resolveTradeStretches({ entries, requests: [request(entries, 2)], participantCodes: ["AAA", "BBB"], seasonName: "2026/27", countTeamOptions: true })).toThrow();
  });

  it("ricostruisce tutte le informazioni dal testo importato senza fidarsi dei calcoli client", () => {
    const serialized = JSON.parse(JSON.stringify([request()]));
    const candidates = tradeStretchContracts([cut], "2026/27", true);
    expect(hydrateTradeStretches(serialized, candidates, ["AAA", "BBB"])[0]).toMatchObject({ name: cut.name, residualCost: 300, years: 3 });
    expect(hydrateTradeStretches([], candidates, ["AAA", "BBB"])).toEqual([]);
  });

  it("rende possibile il risultato finale quando entrambi gli ordini separati violerebbero il cap", () => {
    const outgoing: RosterEntry = { ...cut, name: "Ceduto", cost: 100, contract: "28", state: "active", role: "G" };
    const other = { ...outgoing, name: "Altri contratti", cost: 650 };
    const dpe = { ...outgoing, name: "DPE", slot: "dpe" as const, cost: 250 };
    const incoming = { ...outgoing, name: "Ricevuto", teamCode: "BBB", cost: 160, contract: "27" };
    const before = { ...emptyLeagueState(), rosterEntries: [cut, outgoing, other, dpe, incoming] };
    const resolved = resolveTradeStretches({ entries: before.rosterEntries, requests: [request()], participantCodes: ["AAA", "BBB"], seasonName: "2026/27", countTeamOptions: true });
    const input: Parameters<typeof evaluateTrade>[0] = { phase: "regular_season", tradesOpen: true, enforceRoleMinimums: false,
      teams: [
        { code: "AAA", currentCost: 1050, futureCosts: [{ seasonName: "2027/28", currentCost: 1000 }, { seasonName: "2028/29", currentCost: 0 }], slots: { regular: 2, twoWay: 0, gLeague: 0, dpe: 1 }, roles: { G: 2, A: 0, C: 0 } },
        { code: "BBB", currentCost: 160, futureCosts: [{ seasonName: "2027/28", currentCost: 0 }, { seasonName: "2028/29", currentCost: 0 }], slots: { regular: 1, twoWay: 0, gLeague: 0, dpe: 0 }, roles: { G: 1, A: 0, C: 0 } },
      ], playerMoves: [
        { id: "Ceduto", fromTeamCode: "AAA", toTeamCode: "BBB", sourceSlot: "regular" as const, destinationSlot: "regular" as const, cost: 100, capCost: 100, role: "G" as const, futureCapCosts: { "2027/28": 100 } },
        { id: "Ricevuto", fromTeamCode: "BBB", toTeamCode: "AAA", sourceSlot: "regular" as const, destinationSlot: "regular" as const, cost: 160, capCost: 160, role: "G" as const, futureCapCosts: {} },
      ], cuts: [], pickMoves: [] };
    expect(evaluateTrade(input).warnings.some((warning) => warning.code.includes("CAP"))).toBe(true);
    const stretchOnly = evaluateTrade({ ...input, playerMoves: [], stretches: resolved.stretches });
    expect(stretchOnly.warnings.some((warning) => warning.code.includes("FUTURE_CAP"))).toBe(true);
    const combined = evaluateTrade({ ...input, stretches: resolved.stretches });
    expect(combined.valid).toBe(true);
    expect(combined.warnings.filter((warning) => warning.code.includes("CAP"))).toEqual([]);
    const after = applyValidatedTrade(before, { playerMoves: [{ stateIndex: 1, toTeamCode: "BBB", destinationSlot: "regular" }, { stateIndex: 4, toTeamCode: "AAA", destinationSlot: "regular" }],
      pickMoves: [], pickClauses: [], qualifyingOfferMoves: [], existingClauseChanges: [], cuts: [], stretches: resolved.changes });
    for (const [distance, seasonName] of ["2026/27", "2027/28", "2028/29"].entries()) {
      const salary = 1000 - calculateCapSpace({ entries: entriesForDpeAdjustedCap(after.rosterEntries.filter((entry) => entry.teamCode === "AAA"), distance), seasonName, optionSeasonName: "2026/27", countTeamOptions: true });
      expect(salary).toBe([910, 1000, 100][distance]);
    }
    expect(combined.calculated.teamResults[0].spaceAfter).toBe(90);
    expect(combined.calculated.teamResults[0].futureCaps.map((future) => future.spaceAfter)).toEqual([0, 900]);
    const reversed = buildMovementReversal(after, before, after);
    expect(reversed.rosterEntries.find((entry) => entry.name === cut.name)).toEqual(cut);
    const redone = buildMovementReversal(reversed, after, before);
    expect(redone.rosterEntries.find((entry) => entry.name === cut.name)).toMatchObject({ cost: 100, stretchProvisionApplied: true });
  });

  it("blocca duplicati e rate non idonee anche nel motore del simulatore", () => {
    const stretch = hydrateTradeStretches([request()], tradeStretchContracts([cut], "2026/27", true), ["AAA", "BBB"])[0];
    const result = evaluateTrade({ phase: "offseason", teams: [], playerMoves: [], pickMoves: [], cuts: [], stretches: [stretch, stretch] });
    expect(result.errors.some((error) => error.code === "TRADE_EXISTING_STRETCH_INVALID")).toBe(true);
  });
});
