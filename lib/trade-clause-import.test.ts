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
