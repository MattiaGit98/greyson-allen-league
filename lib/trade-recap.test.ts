import { describe, expect, it, vi } from "vitest";
import { tradeSimulationRecap } from "../app/admin/scambi/trade-builder";
import { tradeMovementPresentation } from "./trade-movement-display";

vi.mock("@/lib/rules/trade", async () => import("./rules/trade"));
vi.mock("@/lib/rules/roster", async () => import("./rules/roster"));
vi.mock("@/lib/roster-slot-limits", async () => import("./roster-slot-limits"));
vi.mock("@/lib/sign-and-trade", async () => import("./sign-and-trade"));
vi.mock("@/lib/trade-clause-selection", async () => import("./trade-clause-selection"));

type Recap = Parameters<typeof tradeSimulationRecap>[0];
const teams: Recap["teams"] = ["AAA", "BBB", "CCC"].map((code) => ({
  code, name: code, currentSeasonName: "2026/27", currentCost: 0, futureCosts: [], players: [],
  picks: [], qualifyingOffers: [], cutPlayerNames: [], stretchContracts: [],
}));
function fixture(overrides: Partial<Recap> = {}): Recap {
  return { teams, participantCodes: ["AAA", "BBB", "CCC"], playerMoves: [], pickMoves: [], qualifyingOfferMoves: [],
    cuts: [], promotions: [], stretches: [], pickClauses: [], existingClauseChanges: [], existingClauseAgreements: [], ...overrides };
}
const playerMove: Recap["playerMoves"][number] = {
  id: "AAA-player", name: "Giocatore", fromTeamCode: "AAA", toTeamCode: "BBB", cost: 31, capCost: 31,
  contract: "PENDING", role: "G", sourceSlot: "two_way", destinationSlot: "regular",
};
const clause: Recap["pickClauses"][number] = {
  id: "new", pickId: "BBB-first", pickOwnerTeamCode: "BBB", beneficiaryTeamCode: "AAA", year: 2027, round: "1° giro",
  hasExistingCondition: false, clause: "protected_top_5", counterpartyPickId: "AAA-later", counterpartyYear: 2028, counterpartyRound: "2° giro",
  counterpartyHasExistingCondition: false, pickTitle: "2027 · 1° giro · BBB", pickOwnerName: "Bbb", counterpartyTitle: "2028 · 2° giro · AAA", counterpartyTeamCode: "AAA",
};

describe("recap leggibile da condividere senza codice di importazione", () => {
  it("scrive soltanto i nomi dei giocatori ceduti e ricevuti, senza dati tecnici o caratteri invisibili", () => {
    const text = tradeSimulationRecap(fixture({ playerMoves: [{ ...playerMove, destinationSlot: "two_way" }] }));
    expect(text).toBe("AAA\nCede: Giocatore\nRiceve: —\n\nBBB\nCede: —\nRiceve: Giocatore\n\nCCC\nCede: —\nRiceve: —");
    expect(text).not.toMatch(/[\u200B\u200C\u2063]/u);
    expect(text).not.toContain("PENDING");
    expect(text).not.toContain("31");
  });

  it("separa tagli, spostamenti, stretch e le due categorie di clausole", () => {
    const old: Recap["existingClauseAgreements"][number] = { agreementId: "old", subjectPickId: "AAA-old", counterpartyPickId: "BBB-old",
      subjectOwnerTeamCode: "AAA", counterpartyOwnerTeamCode: "BBB", subjectYear: 2028, counterpartyYear: 2028,
      subjectRound: "1° giro", counterpartyRound: "1° giro", clause: "swap", label: "Swap precedente", subjectIndex: 0, counterpartyIndex: 1 };
    const text = tradeSimulationRecap(fixture({ playerMoves: [{ ...playerMove, fromTeamCode: "BBB", toTeamCode: "AAA" }],
      cuts: [{ id: "cut", teamCode: "AAA", name: "Tagliato", cost: 3, contract: "27", role: "G", slot: "regular", stretchYears: 3, stretchResidualCost: 3 }],
      promotions: [{ id: "own", name: "Proprio", teamCode: "AAA", sourceSlot: "g_league", destinationSlot: "regular" }],
      stretches: [{ id: "old-cut", name: "Vecchio", teamCode: "AAA", stateIndex: 0, cost: 30, contract: "27", currentCapCost: 30, futureCapCosts: {}, residualCost: 30, stretchOptions: [2, 3], years: 2 }],
      pickClauses: [clause], existingClauseAgreements: [old], existingClauseChanges: [{ ...old, action: "remove", clause: null }],
    }));
    const [aaa, bbb, ccc] = text.split("\n\n");
    expect(aaa).toContain("Riceve: Giocatore\nTagli contestuali: Tagliato\n");
    expect(aaa).toContain("\nSpostamenti contestuali: Proprio: G-League → Roster; Giocatore: Two-way → Roster\n");
    expect(aaa).toContain("\nStretch contestuali: Vecchio: 2 rate da 15 crediti; Tagliato: 3 rate da 1 credito\n");
    expect(aaa).toContain("\nClausole inserite: Protezione top 5");
    expect(aaa).toContain("\nClausole rimosse: Swap precedente");
    expect(bbb).toContain("\nClausole rimosse: Swap precedente");
    expect(ccc).not.toContain("Clausole");
    expect(text).not.toContain("Operazioni contestuali:");
  });

  it("mostra scelte e Q.O. senza perdere i dati leggibili già richiesti", () => {
    const text = tradeSimulationRecap(fixture({ pickMoves: [{ id: "pick", label: "Scelta", year: 2028, round: "1° giro", originOrOverall: "CCC",
      fromTeamCode: "AAA", toTeamCode: "BBB", hasExistingCondition: false, clause: "none", counterpartyPickId: null,
      counterpartyYear: null, counterpartyRound: null, counterpartyHasExistingCondition: false, counterpartyTitle: null, counterpartyTeamCode: null }],
      qualifyingOfferMoves: [{ id: "qo", playerName: "Diritto", amount: 3, fromTeamCode: "BBB", toTeamCode: "CCC" }],
    }));
    const [aaa, bbb, ccc] = text.split("\n\n");
    expect(aaa).toContain("Cede: Scelta 2028 · 1° giro · CCC");
    expect(bbb).toContain("Riceve: Scelta 2028 · 1° giro · CCC");
    expect(bbb).toContain("Cede: Q.O. Diritto (3 crediti)");
    expect(ccc).toContain("Riceve: Q.O. Diritto (3 crediti)");
  });

  it.each(["swap", "protected_top_5"] as const)("cita la clausola %s solo ai proprietari finali coinvolti", (kind) => {
    const agreement = { ...clause, clause: kind };
    const text = tradeSimulationRecap(fixture({ pickClauses: [agreement], pickMoves: [{ id: clause.pickId, label: "Scelta", year: 2027, round: "1° giro", originOrOverall: "BBB",
      fromTeamCode: "BBB", toTeamCode: "CCC", hasExistingCondition: false, clause: "none", counterpartyPickId: null,
      counterpartyYear: null, counterpartyRound: null, counterpartyHasExistingCondition: false, counterpartyTitle: null, counterpartyTeamCode: null }] }));
    const [aaa, bbb, ccc] = text.split("\n\n");
    expect(aaa).toContain("Clausole inserite:");
    expect(bbb).not.toContain("Clausole inserite:");
    expect(ccc).toContain("Clausole inserite:");
  });

  it("preserva la visualizzazione degli accordi già registrati nei movimenti", () => {
    const result = tradeMovementPresentation("Scambio AAA ↔ BBB ↔ CCC: Clausola su scelta 2027 1° giro BBB: protetta top 5; contropartita 2028 2° giro CCC; proprietari finali BBB ↔ AAA; a favore di AAA");
    const sections = result!.full.split("\n\n");
    expect(sections[0]).toContain("Clausole:");
    expect(sections[1]).toContain("Clausole:");
    expect(sections[2]).not.toContain("Clausole:");
    expect(result!.full).not.toContain("Altri dettagli");
  });
});
