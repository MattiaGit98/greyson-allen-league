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
      player("Economico", "G", "28 (Q)", 5),
      player("Altra scadenza", "A", "27", 30),
      player("Costoso", "C", "28 (Q)", 20),
    ];
    expect(sortPlayerEntries(entries, "2026/27", { key: "contract", direction: "asc" }).map((entry) => entry.name))
      .toEqual(["Altra scadenza", "Costoso", "Economico"]);
    expect(sortPlayerEntries(entries, "2026/27", { key: "contract", direction: "desc" }).map((entry) => entry.name))
      .toEqual(["Costoso", "Economico", "Altra scadenza"]);
  });

  it("ordina le scadenze dello stesso anno secondo T.O., R.E., EXT, Q.O. e annuale", () => {
    const entries = [
      player("Annuale", "G", "27", 100),
      player("Qualifying offer", "G", "27 (Q)", 100),
      player("Estensione", "G", "27 (E)", 100),
      player("Rookie extension", "G", "27 + R.E.", 100),
      player("Team option", "G", "27 + T.O.", 100),
      player("Anno dopo", "G", "28", 1),
    ];
    const expected = ["Anno dopo", "Team option", "Rookie extension", "Estensione", "Qualifying offer", "Annuale"];
    expect(sortPlayerEntries(entries, "2026/27", { key: "contract", direction: "desc" }).map((entry) => entry.name))
      .toEqual(expected);
    expect(sortPlayerEntries(entries, "2026/27", { key: "contract", direction: "asc" }).map((entry) => entry.name))
      .toEqual([...expected].reverse());
  });

  it("tratta T.O. e R.E. già da decidere come scadenze dell'anno precedente", () => {
    const entries = [
      player("Annuale", "G", "27", 1),
      player("Team option da decidere", "G", "T.O.", 1),
      player("Rookie extension da decidere", "G", "R.E.", 1),
    ];
    expect(sortPlayerEntries(entries, "2027/28", { key: "contract", direction: "desc" }).map((entry) => entry.name))
      .toEqual(["Team option da decidere", "Rookie extension da decidere", "Annuale"]);
  });

  it("mantiene la cronologia quando gli anni abbreviati passano da 99 a 00", () => {
    const entries = [player("Anno 99", "G", "99", 1), player("Anno 00", "G", "00", 1)];
    expect(sortPlayerEntries(entries, "2098/99", { key: "contract", direction: "desc" }).map((entry) => entry.name))
      .toEqual(["Anno 00", "Anno 99"]);
  });
});
