import { describe, expect, it } from "vitest";
import { emptyLeagueState } from "./league-state";
import { closeCurrentSeasonExtensionWindow } from "./league-transition";

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
