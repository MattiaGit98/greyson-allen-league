import { describe, expect, it } from "vitest";
import { emptyLeagueState } from "./league-state";
import { applyTeamOptionDeadline, buildLeagueTransitionPreview, closeCurrentSeasonExtensionWindow } from "./league-transition";
import { historyConfirmationForTransition } from "./phase-history-confirmation";

describe("avvisi aggiornati su buyout e free agent", () => {
  it("apre il buyout al Termine asta e non cambia i contratti alla deadline", () => {
    const input = { seasonName: "2026/27", state: emptyLeagueState() };
    const auction = buildLeagueTransitionPreview({ ...input, currentMoment: "auction_start" });
    expect(auction.newPossibilities).toContain("Si apre la finestra per i buyout, con riduzione del 20% del costo residuo.");
    const deadline = buildLeagueTransitionPreview({ ...input, currentMoment: "contract_delivery" });
    expect(deadline.newPossibilities.join(" ")).not.toMatch(/buyout|prime otto/);
    expect(deadline.automaticActions.join(" ")).not.toMatch(/senza Q.O./);
  });
});

describe("avanzamento a Inizio asta", () => {
  it("rimuove soltanto l'estensione non esercitata del contratto in scadenza", () => {
    const state = emptyLeagueState();
    state.rosterEntries = [
      { name: "In scadenza", cost: 200, contract: "27 (E)", state: "active", slot: "regular", teamCode: "AAA" },
      { name: "Futuro", cost: 200, contract: "28 (E)", state: "active", slot: "regular", teamCode: "AAA" },
      { name: "Senza estensione", cost: 20, contract: "27", state: "active", slot: "regular", teamCode: "AAA" },
    ];

    expect(closeCurrentSeasonExtensionWindow(state, "2026/27").rosterEntries.map((entry) => entry.contract))
      .toEqual(["27", "28 (E)", "27"]);
    expect(state.rosterEntries[0].contract).toBe("27 (E)");
  });
});

describe("scadenza contratti da rookie", () => {
  it("non può eliminare silenziosamente una T.O. playoff ancora da decidere", () => {
    const state = emptyLeagueState();
    state.rosterEntries = [{ name: "Playoff", cost: 3, contract: "T.O.", state: "active", slot: "g_league", teamCode: "AAA", playoffTeamOptionUsedSeason: "2025/26" }];
    expect(() => applyTeamOptionDeadline(state, "2026/27")).toThrow();
  });
});

describe("conferme dello storico prima dell’avanzamento", () => {
  it("richiede il Roster vincitore soltanto alla riapertura della free agency", () => {
    expect(historyConfirmationForTransition("free_agency_reopening")).toMatchObject({
      field: "winner_roster_history_confirmed",
      label: expect.stringContaining("Roster vincitore"),
    });
    expect(historyConfirmationForTransition("free_agency_end")).toBeNull();
  });

  it("richiede Albo d’oro e Numero titoli alla fine della stagione", () => {
    expect(historyConfirmationForTransition("season_end")).toMatchObject({
      field: "honours_history_confirmed",
      label: expect.stringContaining("Numero titoli"),
    });
  });
});
