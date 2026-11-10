import { describe, expect, it, vi } from "vitest";
import { hydrateTradeImport, readTradeImportPayload, tradeImportPayload, tradeSimulationRecap, withTradeImportPayload } from "../app/admin/scambi/trade-builder";
import { tradeMovementPresentation } from "./trade-movement-display";

vi.mock("@/lib/rules/trade", async () => import("./rules/trade"));
vi.mock("@/lib/rules/roster", async () => import("./rules/roster"));
vi.mock("@/lib/roster-slot-limits", async () => import("./roster-slot-limits"));
vi.mock("@/app/admin/cap-force-control", () => ({ CapBlocker: () => null }));
vi.mock("@/lib/sign-and-trade", async () => import("./sign-and-trade"));
vi.mock("@/lib/trade-stretch", async () => import("./trade-stretch"));
vi.mock("@/lib/trade-clause-selection", async () => import("./trade-clause-selection"));

type Team = Parameters<typeof hydrateTradeImport>[1][number];
type Payload = Parameters<typeof hydrateTradeImport>[0];
const teams: Team[] = ["AAA", "BBB", "CCC"].map((code) => ({
  code, name: code, currentSeasonName: "2026/27", currentCost: 0, futureCosts: [], cutPlayerNames: [], stretchContracts: [], players: [], qualifyingOffers: [],
  picks: [
    { id: `${code}-first`, label: "Scelta", year: 2027, round: "1° giro", originOrOverall: code, tradable: true, hasExistingCondition: false },
    { id: `${code}-later`, label: "Scelta", year: 2028, round: "2° giro", originOrOverall: code, tradable: true, hasExistingCondition: false },
    { id: `${code}-fourth`, label: "Scelta", year: 2030, round: "1° giro", originOrOverall: code, tradable: false, virtual: true, hasExistingCondition: false },
  ],
}));
function payload(overrides: Partial<Payload> = {}): Payload {
  return { version: 1, participantCodes: ["AAA", "BBB", "CCC"], playerMoves: [], pickMoves: [], qualifyingOfferMoves: [], cuts: [], promotions: [], existingClauseAgreementIds: [],
    pickClauses: [{ pickId: "BBB-first", clause: "protected_top_5", counterpartyPickId: "AAA-later" }], ...overrides };
}
function recap(imported: ReturnType<typeof hydrateTradeImport>) {
  return tradeSimulationRecap({ ...imported, teams, existingClauseAgreements: [] });
}

describe("testo e importazione delle nuove clausole", () => {
  it("separa tutte le operazioni nel recap e lascia solo i nomi nelle cessioni e negli arrivi", () => {
    const player = { id: "BBB:player:Mobile", name: "Mobile", cost: 3, capCost: 3, futureCapCosts: {}, contract: "PENDING", role: "G" as const,
      slot: "two_way" as const, cuttable: true, stretchOptions: [2, 3] as (2 | 3)[], movementDestinations: ["regular" as const, "g_league" as const], allowedDestinations: ["regular" as const, "two_way" as const, "g_league" as const] };
    const own = { ...player, id: "AAA:player:Own", name: "Own" };
    const cut = { ...player, id: "AAA:player:Cut", name: "Cut", slot: "regular" as const };
    const old = { id: "AAA:cut:0:Old", name: "Old", teamCode: "AAA", cost: 30, contract: "27", stateIndex: 0, currentCapCost: 30, residualCost: 30, futureCapCosts: {}, stretchOptions: [2, 3] as (2 | 3)[] };
    const withPlayers = teams.map((team) => ({ ...team, players: team.code === "AAA" ? [own, cut] : team.code === "BBB" ? [player] : [], stretchContracts: team.code === "AAA" ? [old] : [] }));
    const agreements: Parameters<typeof hydrateTradeImport>[2] = [{ agreementId: "old", subjectPickId: "AAA-later", counterpartyPickId: "BBB-later", subjectOwnerTeamCode: "AAA", counterpartyOwnerTeamCode: "BBB", subjectYear: 2028, counterpartyYear: 2028, subjectRound: "2° giro", counterpartyRound: "2° giro", clause: "swap", label: "Swap precedente", subjectIndex: 1, counterpartyIndex: 4 }];
    const imported = hydrateTradeImport(payload({ playerMoves: [{ id: player.id, fromTeamCode: "BBB", toTeamCode: "AAA", destinationSlot: "g_league" }],
      cuts: [{ id: cut.id, teamCode: "AAA", stretchYears: 3 }], promotions: [{ id: own.id, teamCode: "AAA", sourceSlot: "two_way", destinationSlot: "regular" }],
      stretches: [{ id: old.id, teamCode: "AAA", cost: old.cost, contract: old.contract, years: 2 }], existingClauseAgreementIds: ["old"],
    }), withPlayers, agreements);
    const text = tradeSimulationRecap({ ...imported, teams: withPlayers, existingClauseAgreements: agreements });
    const [aaa, bbb, ccc] = text.split("\n\n");
    expect(aaa).toContain("Cede: —\nRiceve: Mobile\n");
    expect(bbb).toContain("Cede: Mobile\nRiceve: —");
    expect(aaa).toContain("\nTagli contestuali: Cut\n");
    expect(aaa).toContain("\nSpostamenti contestuali: Own: Two-way → Roster; Mobile: Two-way → G-League\n");
    expect(aaa).toContain("\nStretch contestuali: Old: 2 rate da 15 crediti; Cut: 3 rate da 1 credito\n");
    expect(aaa).toContain("\nClausole inserite:");
    expect(aaa).toContain("\nClausole rimosse: Swap precedente");
    expect(bbb).toContain("Clausole rimosse: Swap precedente");
    expect(ccc).not.toContain("Clausole");
    expect(text).not.toContain("Operazioni contestuali:");
    expect(text).not.toContain("Clausole:");
    expect(text).not.toContain("PENDING");
    const decoded = readTradeImportPayload(withTradeImportPayload(text, tradeImportPayload(imported)));
    const restored = hydrateTradeImport(decoded.payload, withPlayers, agreements);
    expect(tradeSimulationRecap({ ...restored, teams: withPlayers, existingClauseAgreements: agreements })).toBe(text);
  });

  it.each(["cost", "contract", "role", "capCost", "futureCapCosts"] as const)("rifiuta l'importazione se %s cambia anche se non è più scritto accanto al nome", (field) => {
    const player = { id: "BBB:player:Mobile", name: "Mobile", cost: 3, capCost: 3, futureCapCosts: {}, contract: "PENDING", role: "G" as const,
      slot: "regular" as const, cuttable: true, stretchOptions: [2, 3] as (2 | 3)[], movementDestinations: [], allowedDestinations: ["regular" as const] };
    const withPlayer = teams.map((team) => ({ ...team, players: team.code === "BBB" ? [player] : [] }));
    const imported = hydrateTradeImport(payload({ pickClauses: [], playerMoves: [{ id: player.id, fromTeamCode: "BBB", toTeamCode: "AAA", destinationSlot: "regular" }] }), withPlayer, []);
    const serialized = tradeImportPayload(imported);
    const changes = { cost: 4, contract: "28", role: "A", capCost: 4, futureCapCosts: { "2027/28": 3 } };
    const changed = withPlayer.map((team) => ({ ...team, players: team.players.map((entry) => ({ ...entry, [field]: changes[field] })) }));
    expect(() => hydrateTradeImport(serialized, changed, [])).toThrow(/cambiati dopo la simulazione/);
  });

  it("mantiene lo slot finale di un ricevuto spostato senza introdurre un secondo spostamento nel payload", () => {
    const id = "BBB:player:Mobile";
    const withPlayer = teams.map((team) => ({ ...team, players: team.code === "BBB" ? [{
      id, name: "Mobile", cost: 3, capCost: 3, futureCapCosts: {}, contract: "PENDING", role: "G" as const,
      slot: "two_way" as const, cuttable: true, stretchOptions: [2, 3] as (2 | 3)[], movementDestinations: ["regular" as const, "g_league" as const],
      allowedDestinations: ["regular" as const, "two_way" as const, "g_league" as const],
    }] : [] }));
    const imported = hydrateTradeImport(payload({ pickClauses: [], playerMoves: [{ id, fromTeamCode: "BBB", toTeamCode: "AAA", destinationSlot: "g_league" }] }), withPlayer, []);
    const text = tradeSimulationRecap({ ...imported, teams: withPlayer, existingClauseAgreements: [] });
    expect(text).toContain("G-League");
    const decoded = readTradeImportPayload(withTradeImportPayload(text, tradeImportPayload(imported)));
    const restored = hydrateTradeImport(decoded.payload, withPlayer, []);
    expect(restored.playerMoves[0]).toMatchObject({ sourceSlot: "two_way", destinationSlot: "g_league" });
    expect(restored.promotions).toEqual([]);
    expect(tradeSimulationRecap({ ...restored, teams: withPlayer, existingClauseAgreements: [] })).toBe(text);
  });

  it("mantiene nel round-trip la stretch di un giocatore ricevuto e tagliato nello stesso scambio", () => {
    const id = "BBB:player:Nuovo";
    const withPlayer = teams.map((team) => ({ ...team, players: team.code === "BBB" ? [{
      id, name: "Nuovo", cost: 31, capCost: 31, futureCapCosts: {}, contract: "PENDING", role: "G" as const,
      slot: "regular" as const, cuttable: true, stretchOptions: [2, 3] as (2 | 3)[], movementDestinations: [], allowedDestinations: ["regular" as const],
    }] : [] }));
    const imported = hydrateTradeImport(payload({ pickClauses: [],
      playerMoves: [{ id, fromTeamCode: "BBB", toTeamCode: "AAA", destinationSlot: "regular" }],
      cuts: [{ id, teamCode: "AAA", stretchYears: 3 }],
    }), withPlayer, []);
    const text = tradeSimulationRecap({ ...imported, teams: withPlayer, existingClauseAgreements: [] });
    expect(text).toContain("Tagli contestuali: Nuovo");
    expect(text).toContain("Stretch contestuali: Nuovo: 3 rate da 11 crediti");
    const encoded = withTradeImportPayload(text, tradeImportPayload(imported));
    const decoded = readTradeImportPayload(encoded);
    const restored = hydrateTradeImport(decoded.payload, withPlayer, []);
    expect(restored.cuts).toEqual(imported.cuts);
    expect(restored.stretches).toEqual([]);
    expect(tradeSimulationRecap({ ...restored, teams: withPlayer, existingClauseAgreements: [] })).toBe(text);
  });

  it("importa una protezione senza trasferimenti e la attribuisce al titolare della contropartita", () => {
    const imported = hydrateTradeImport(payload(), teams, []);
    expect(imported.pickClauses[0]).toMatchObject({ beneficiaryTeamCode: "AAA", postTradeOwnerTeamCode: "BBB", counterpartyPostTradeOwnerTeamCode: "AAA" });
    const sections = recap(imported).split("\n\n");
    expect(sections[0]).toContain("Protezione top 5 sulla scelta");
    expect(sections[0]).toContain("contropartita:");
    expect(sections[1]).toContain("Protetta top 5");
    expect(sections[2]).not.toContain("Clausole:");
  });

  it("usa i proprietari finali per entrambe le scelte e non cita clausole nella squadra che non le possiede più", () => {
    const imported = hydrateTradeImport(payload({ pickMoves: [
      { id: "BBB-first", fromTeamCode: "BBB", toTeamCode: "CCC" },
      { id: "CCC-later", fromTeamCode: "CCC", toTeamCode: "AAA" },
    ], pickClauses: [{ pickId: "BBB-first", clause: "protected_top_2", counterpartyPickId: "CCC-later" }] }), teams, []);
    expect(imported.pickClauses[0]).toMatchObject({ beneficiaryTeamCode: "AAA", postTradeOwnerTeamCode: "CCC", counterpartyPostTradeOwnerTeamCode: "AAA" });
    const sections = recap(imported).split("\n\n");
    expect(sections[0]).toContain("Protezione top 2");
    expect(sections[1]).not.toContain("Clausole:");
    expect(sections[2]).toContain("Protetta top 2");
    expect(sections[2]).toContain("(Aaa)");
  });

  it.each(["protected_top_1", "swap"] as const)("conserva un round-trip esatto del testo con %s", (clause) => {
    const imported = hydrateTradeImport(payload({ pickClauses: [{ clause, pickId: clause === "swap" ? "AAA-first" : "BBB-first", counterpartyPickId: clause === "swap" ? "BBB-first" : "AAA-fourth" }] }), teams, []);
    const text = recap(imported);
    const encoded = withTradeImportPayload(text, tradeImportPayload(imported));
    const decoded = readTradeImportPayload(encoded);
    expect(decoded.recap).toBe(text);
    expect(recap(hydrateTradeImport(decoded.payload, teams, []))).toBe(text);
  });

  it("rifiuta clausole diventate incompatibili con i trasferimenti", () => {
    expect(() => hydrateTradeImport(payload({ pickMoves: [{ id: "BBB-first", fromTeamCode: "BBB", toTeamCode: "AAA" }] }), teams, [])).toThrow(/protezione.*non è più valida/);
    expect(() => hydrateTradeImport(payload({ pickClauses: [{ pickId: "BBB-first", clause: "swap", counterpartyPickId: "AAA-later" }] }), teams, [])).toThrow(/swap.*non è più valido/);
  });

  it("rifiuta due clausole sulla stessa scelta, anche con tipi diversi", () => {
    expect(() => hydrateTradeImport(payload({ pickClauses: [
      { pickId: "BBB-first", clause: "protected_top_5", counterpartyPickId: "AAA-later" },
      { pickId: "BBB-first", clause: "swap", counterpartyPickId: "CCC-first" },
    ] }), teams, [])).toThrow(/incomplete o in conflitto/);
  });

  it("mostra i nuovi accordi nei movimenti solo ai due proprietari finali, preservando il formato storico", () => {
    const result = tradeMovementPresentation("Scambio AAA ↔ BBB ↔ CCC: Clausola su scelta 2027 1° giro BBB: protetta top 5; contropartita 2028 2° giro CCC; proprietari finali BBB ↔ AAA; a favore di AAA");
    const sections = result!.full.split("\n\n");
    expect(sections[0]).toContain("Clausole:");
    expect(sections[1]).toContain("Clausole:");
    expect(sections[2]).not.toContain("Clausole:");
    expect(result!.full).not.toContain("Altri dettagli");
    expect(tradeMovementPresentation("Scambio AAA ↔ BBB: Clausola su scelta 2027 1° giro AAA: diritto di swap; contropartita 2027 1° giro BBB; a favore di AAA")!.full).toContain("Clausole:");
  });
});
