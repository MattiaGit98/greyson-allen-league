import { describe, expect, it } from "vitest";
import type { RosterEntry } from "./league-types";
import { sortPlayerEntries } from "./roster-display-sort";

function player(name: string, role: RosterEntry["role"], contract: string, cost: number): RosterEntry {
  return { name, role, contract, cost, state: "active", slot: "regular", teamCode: "AAA" };
}

describe("ordinamento pubblico dei roster", () => {
  it("a parità di ruolo ordina sempre per crediti decrescenti", () => {
    const entries = [
      player("G economica", "G", "27", 5),
      player("Ala", "A", "27", 30),
      player("G costosa", "G", "27", 20),
    ];
    expect(sortPlayerEntries(entries, "2026/27", { key: "role", direction: "asc" }).map((entry) => entry.name))
      .toEqual(["G costosa", "G economica", "Ala"]);
    expect(sortPlayerEntries(entries, "2026/27", { key: "role", direction: "desc" }).map((entry) => entry.name))
      .toEqual(["Ala", "G costosa", "G economica"]);
  });

  it("a parità di scadenza ordina sempre per crediti decrescenti", () => {
    const entries = [
      player("Economico", "G", "28", 5),
      player("Altra scadenza", "A", "27", 30),
      player("Costoso", "C", "28 (Q)", 20),
    ];
    expect(sortPlayerEntries(entries, "2026/27", { key: "contract", direction: "asc" }).map((entry) => entry.name))
      .toEqual(["Altra scadenza", "Costoso", "Economico"]);
    expect(sortPlayerEntries(entries, "2026/27", { key: "contract", direction: "desc" }).map((entry) => entry.name))
      .toEqual(["Costoso", "Economico", "Altra scadenza"]);
  });
});
