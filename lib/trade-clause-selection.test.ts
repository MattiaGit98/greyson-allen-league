import { describe, expect, it } from "vitest";
import { reconcileTradePickClauses, tradeClauseBeneficiary, tradeClausePickOptions } from "./trade-clause-selection";
import type { TradePickClauseAgreement } from "./rules/trade";
import { applyValidatedTrade } from "./trade-state";
import { emptyLeagueState } from "./league-state";
import { applyCompleteDraftOrder } from "./draft-positions";

function pick(id: string, ownerTeamCode: string, year = 2027, round = "1° giro", tradable = true, hasExistingCondition = false) {
  return { ownerTeamCode, pick: { id, year, round, tradable, hasExistingCondition } };
}
const allPicks = [pick("a1", "AAA"), pick("b1", "BBB"), pick("c1", "CCC"), pick("a2", "AAA", 2027, "2° giro"),
  pick("c2", "CCC", 2027, "2° giro"), pick("a-next", "AAA", 2028), pick("b-next", "BBB", 2028),
  pick("a-fourth", "AAA", 2030, "1° giro", false), pick("a-fifth", "AAA", 2031, "1° giro", false),
  pick("conditioned", "AAA", 2028, "2° giro", true, true)];
function context(moves: Record<string, string | undefined> = {}, removed = new Set<string>()) {
  return { allPicks, participantCodes: ["AAA", "BBB", "CCC"],
    postTradeOwner: (id: string) => moves[id] ?? allPicks.find((row) => row.pick.id === id)?.ownerTeamCode ?? "",
    canReuseConditionedPick: (item: typeof allPicks[number]["pick"]) => !item.hasExistingCondition || removed.has(item.id),
    protectionCounterpartyDraftYears: [2027, 2028, 2029, 2030] };
}
function options(clause: TradePickClauseAgreement["clause"], selectedPickId: string, moves = {}, reservedPickIds = new Set<string>()) {
  return tradeClausePickOptions({ ...context(moves), teamCode: "AAA", clause, selectedPickId, reservedPickIds });
}
const ids = (rows: typeof allPicks) => rows.map((row) => row.pick.id);
function agreement(overrides: Partial<TradePickClauseAgreement> = {}): TradePickClauseAgreement {
  return { id: "protection", pickId: "b1", pickOwnerTeamCode: "BBB", beneficiaryTeamCode: "AAA", year: 2027, round: "1° giro",
    hasExistingCondition: false, clause: "protected_top_5", counterpartyPickId: "a-next", counterpartyYear: 2028,
    counterpartyRound: "1° giro", counterpartyHasExistingCondition: false, counterpartyOwnerTeamCode: "AAA", ...overrides };
}

describe("clausole per squadra sui proprietari finali", () => {
  it("swap: mostra le scelte di A e le contropartite di B e C nello stesso anno e giro", () => {
    const result = options("swap", "a1");
    expect(ids(result.subjects)).toEqual(["a1", "a2", "a-next"]);
    expect(ids(result.counterparties)).toEqual(["b1", "c1"]);
  });

  it("protezione: mostra le scelte di B/C non cedute e solo contropartite successive di A", () => {
    const result = options("protected_top_5", "b1");
    expect(ids(result.subjects)).toEqual(["b1", "c1", "c2", "b-next"]);
    expect(ids(result.counterparties)).toEqual(["a2", "a-next", "a-fourth"]);
    expect(ids(options("protected_top_1", "c2").counterparties)).toEqual(["a-next", "a-fourth"]);
  });

  it("comprende scelte appena ricevute, sia come oggetto sia come contropartita", () => {
    const moves = { a1: "BBB", b1: "AAA", "b-next": "AAA" };
    expect(ids(options("swap", "b1", moves).counterparties)).toEqual(["a1", "c1"]);
    expect(ids(options("protected_top_3", "a1", moves).subjects)).toContain("a1");
    expect(ids(options("protected_top_3", "a1", moves).counterparties)).toContain("b-next");
    expect(ids(options("protected_top_3", "a1", moves).subjects)).not.toContain("b1");
  });

  it("non permette di scegliere prima del tipo di clausola né una contropartita senza scelta", () => {
    expect(options("none", "")).toEqual({ subjects: [], counterparties: [] });
    expect(options("swap", "").counterparties).toEqual([]);
  });

  it("esclude le scelte già riservate e le clausole esistenti, salvo rimozione contestuale", () => {
    expect(ids(options("protected_top_1", "b1", {}, new Set(["a-next", "c1"])).subjects)).not.toContain("c1");
    expect(ids(options("protected_top_1", "b1", {}, new Set(["a-next"])).counterparties)).not.toContain("a-next");
    const enabled = tradeClausePickOptions({ ...context({}, new Set(["conditioned"])), teamCode: "AAA", clause: "protected_top_1", selectedPickId: "b1", reservedPickIds: new Set() });
    expect(ids(enabled.counterparties)).toContain("conditioned");
  });

  it("esclude squadre estranee, quarto draft come oggetto e quinto come contropartita", () => {
    const result = tradeClausePickOptions({ ...context(), participantCodes: ["AAA", "BBB"], teamCode: "AAA", clause: "protected_top_1", selectedPickId: "b1", reservedPickIds: new Set() });
    expect(ids(result.subjects)).not.toContain("c1");
    expect(ids(result.subjects)).not.toContain("a-fourth");
    expect(ids(result.counterparties)).not.toContain("a-fifth");
  });

  it("conserva le clausole valide e aggiorna il proprietario della scelta protetta", () => {
    const result = reconcileTradePickClauses([agreement()], context({ b1: "CCC" }));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ beneficiaryTeamCode: "AAA", postTradeOwnerTeamCode: "CCC", counterpartyPostTradeOwnerTeamCode: "AAA" });
  });

  it.each([{ b1: "AAA" }, { "a-next": "BBB" }])("rimuove una clausola diventata incoerente senza riassegnarla a un altro beneficiario: %j", (moves) => {
    const independent = agreement({ id: "swap", pickId: "a2", pickOwnerTeamCode: "AAA", clause: "swap", round: "2° giro",
      counterpartyPickId: "c2", counterpartyYear: 2027, counterpartyRound: "2° giro", counterpartyOwnerTeamCode: "CCC" });
    expect(reconcileTradePickClauses([agreement(), independent], context(moves)).map((item) => item.id)).toEqual(["swap"]);
  });

  it("elimina doppioni e sovrapposizioni su entrambe le scelte", () => {
    expect(reconcileTradePickClauses([agreement(), agreement({ id: "duplicate" }), agreement({ id: "overlap", pickId: "c1" })], context())).toHaveLength(1);
  });

  it("rimuove le nuove clausole se si revoca la rimozione della clausola preesistente", () => {
    const linked = agreement({ counterpartyPickId: "conditioned", counterpartyRound: "2° giro" });
    expect(reconcileTradePickClauses([linked], context({}, new Set(["conditioned"]))).length).toBe(1);
    expect(reconcileTradePickClauses([linked], context())).toEqual([]);
  });

  it("il beneficiario è il titolare del diritto swap o della contropartita di protezione", () => {
    expect(tradeClauseBeneficiary("swap", "AAA", "BBB")).toBe("AAA");
    expect(tradeClauseBeneficiary("protected_top_5", "BBB", "AAA")).toBe("AAA");
  });

  it("risolve al draft una protezione creata su una scelta mai ceduta", () => {
    const state = emptyLeagueState();
    const codes = ["AAA", "BBB"];
    state.teams = codes.map((code) => ({ code, name: code, owner: code, slug: code, credits: 0, cost: 0, players: 0, cutPlayers: 0, qualifyingOffers: 0, draftAssets: 0, nextSeasonCredits: 0, followingSeasonCredits: 0 }));
    state.draftAssets = codes.flatMap((code) => ["1° giro", "2° giro"].map((round) => ({ label: "Scelta", year: 2027, round, originOrOverall: code, teamCode: code })));
    const linked = applyValidatedTrade(state, { playerMoves: [], pickMoves: [], qualifyingOfferMoves: [], cuts: [], existingClauseChanges: [],
      pickClauses: [{ subjectIndex: 2, counterpartyIndex: 1, clause: "protected_top_1" }] });
    const resolved = applyCompleteDraftOrder(linked.draftAssets, 2027, [
      { position: 1, originTeamCode: "BBB", round: "1° giro", cost: 25, isBonus: false },
      { position: 2, originTeamCode: "AAA", round: "1° giro", cost: 21, isBonus: false },
      { position: 3, originTeamCode: "AAA", round: "2° giro", cost: 1, isBonus: false },
      { position: 4, originTeamCode: "BBB", round: "2° giro", cost: 1, isBonus: false },
    ], codes);
    expect(resolved.draftAssets.find((asset) => asset.originTeamCode === "BBB" && asset.round === "1° giro")?.teamCode).toBe("AAA");
    expect(resolved.draftAssets.find((asset) => asset.originTeamCode === "AAA" && asset.round === "2° giro")?.teamCode).toBe("BBB");
  });
});
