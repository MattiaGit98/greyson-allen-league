import { describe, expect, it } from "vitest";
import { advanceSeasonName, calculateCapSpace, displayedSeasonName, previousSeasonName, shouldCountTeamOptions } from "./season-time";
import type { RosterEntry } from "./league-types";

const entries: RosterEntry[] = [
  { name: "Contratto 2027", cost: 100, contract: "27", role: "G", state: "active", slot: "regular", teamCode: "TST" },
  { name: "Contratto 2028", cost: 50, contract: "28 (E)", role: "A", state: "active", slot: "regular", teamCode: "TST" },
  { name: "Team option", cost: 25, contract: "T.O.", role: "C", state: "active", slot: "regular", teamCode: "TST" },
];

describe("logica temporale della stagione", () => {
  it("usa direttamente l'annata assegnata alla fase", () => {
    expect(displayedSeasonName("2026/27")).toBe("2026/27");
    expect(previousSeasonName("2026/27")).toBe("2025/26");
  });

  it("blocca le annate non valide invece di usare un anno di riserva", () => {
    expect(() => advanceSeasonName("annata corrente")).toThrow("Annata non valida");
    expect(() => previousSeasonName("2026")).toThrow("Annata non valida");
  });

  it("distingue l'offseason prima e dopo l'esercizio delle team option", () => {
    expect(shouldCountTeamOptions("offseason", false)).toBe(false);
    expect(shouldCountTeamOptions("offseason", true)).toBe(true);
    expect(shouldCountTeamOptions("auction", false)).toBe(true);
    expect(shouldCountTeamOptions("regular_season", false)).toBe(true);
  });

  it("esclude la team option prima della scadenza e la include dopo", () => {
    expect(calculateCapSpace({ entries, seasonName: "2026/27", optionSeasonName: "2026/27", countTeamOptions: false })).toBe(850);
    expect(calculateCapSpace({ entries, seasonName: "2026/27", optionSeasonName: "2026/27", countTeamOptions: true })).toBe(825);
  });

  it("calcola separatamente i cap futuri", () => {
    expect(calculateCapSpace({ entries, seasonName: "2027/28", optionSeasonName: "2026/27", countTeamOptions: false })).toBe(950);
    expect(calculateCapSpace({ entries, seasonName: "2028/29", optionSeasonName: "2026/27", countTeamOptions: false })).toBe(1000);
  });

  it("conteggia il secondo anno con R.E. ma non impegna le annate successive", () => {
    const exercisedOption: RosterEntry[] = [
      { name: "T.O. esercitata", cost: 10, contract: "27 + R.E.", role: "G", state: "active", slot: "regular", teamCode: "TST" },
    ];
    expect(calculateCapSpace({ entries: exercisedOption, seasonName: "2026/27", optionSeasonName: "2026/27", countTeamOptions: true })).toBe(990);
    expect(calculateCapSpace({ entries: exercisedOption, seasonName: "2027/28", optionSeasonName: "2026/27", countTeamOptions: true })).toBe(1000);
  });

  it("conteggia il terzo anno già raddoppiato dopo l'applicazione della R.E.", () => {
    const extended: RosterEntry[] = [
      { name: "R.E. applicata", cost: 20, contract: "28", role: "G", state: "active", slot: "regular", teamCode: "TST" },
    ];
    expect(calculateCapSpace({ entries: extended, seasonName: "2027/28", optionSeasonName: "2027/28", countTeamOptions: true })).toBe(980);
  });

  it("conteggia un acquisto d'asta in attesa di contratto soltanto nell'annata corrente", () => {
    const pending: RosterEntry[] = [
      { name: "Acquisto asta", cost: 17, contract: "PENDING", role: "A", state: "active", slot: "regular", teamCode: "TST" },
    ];
    expect(calculateCapSpace({ entries: pending, seasonName: "2026/27", optionSeasonName: "2026/27", countTeamOptions: true })).toBe(983);
    expect(calculateCapSpace({ entries: pending, seasonName: "2027/28", optionSeasonName: "2026/27", countTeamOptions: true })).toBe(1000);
  });
});
