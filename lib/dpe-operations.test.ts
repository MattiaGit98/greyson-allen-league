import { describe, expect, it } from "vitest";
import type { RosterEntry } from "./league-types";
import { applyDpeActivation, applyEarlyDpeReintegration } from "./dpe-operations";
import { entriesForDpeAdjustedCap } from "./dpe-rules";
import { calculateCapSpace } from "./season-time";
import { applyContextualContractCut } from "./stretch-provision";
import { salaryCapWarningsForSpaces } from "./cap-override";
import { releaseCapSpaces } from "./release-operations";

const target: RosterEntry = { name: "Infortunato", cost: 20, contract: "28", role: "G", state: "active", slot: "regular", teamCode: "AAA" };
const disabled: RosterEntry = { ...target, name: "DPE esistente", cost: 90, contract: "27", slot: "dpe" };

describe("esercizio DPE senza operazioni contestuali", () => {
  const input = { rosterEntries: [target, disabled], teamCode: "AAA", playerName: target.name, seasonName: "2026/27", leagueMoment: "contract_delivery" as const };
  it("aggiunge una DPE senza modificare né tagliare quelle esistenti", () => {
    const second = { ...disabled, name: "Seconda DPE" };
    const result = applyDpeActivation({ ...input, rosterEntries: [...input.rosterEntries, second] });
    expect(result.filter((entry) => entry.state === "active" && entry.slot === "dpe")).toHaveLength(3);
    expect(result[0]).toMatchObject({ dpeAppliedSeasons: ["2026/27"] });
    expect(result.slice(1)).toEqual([disabled, second]);
    expect(input.rosterEntries[0].slot).toBe("regular");
  });
  it("rispetta finestre, proprietà e contratto da rookie ancora da risolvere", () => {
    expect(() => applyDpeActivation({ ...input, leagueMoment: "auction_start" })).toThrow(/finestra/);
    expect(() => applyDpeActivation({ ...input, teamCode: "BBB" })).toThrow(/non appartiene/);
    expect(() => applyDpeActivation({ ...input, playerName: disabled.name })).toThrow(/già nella DPE/);
    expect(() => applyDpeActivation({ ...input, rosterEntries: [{ ...target, contract: "T.O." }], leagueMoment: "offseason_start" })).toThrow(/contratto da rookie/);
  });

  it.each(["trade_deadline", "buyout_end"] as const)("consente l'esercizio anche a %s, mantenendo costo e contratto", (leagueMoment) => {
    expect(applyDpeActivation({ ...input, leagueMoment })[0]).toMatchObject({
      name: target.name, cost: 20, contract: "28", slot: "dpe", dpeAppliedSeasons: ["2026/27"], dpeActivatedAfterDeadline: true,
    });
  });

  it.each(["free_agency_end", "free_agency_reopening"] as const)("rifiuta una nuova DPE a %s", (leagueMoment) => {
    expect(() => applyDpeActivation({ ...input, leagueMoment })).toThrow(/finestra/);
  });
});

describe("taglio ordinario DPE e stretch sullo stesso giocatore", () => {
  const salary = { ...target, name: "Altri contratti", cost: 1050, contract: "27" };
  const before = [salary, disabled];
  function spaces(entries: RosterEntry[]) {
    return ["2026/27", "2027/28", "2028/29"].map((seasonName, distance) => calculateCapSpace({
      entries: entriesForDpeAdjustedCap(entries, distance), seasonName, optionSeasonName: "2026/27", countTeamOptions: true,
    }));
  }
  function warnings(entries: RosterEntry[]) {
    return salaryCapWarningsForSpaces({ before: spaces(before), after: spaces(entries), seasonNames: ["2026/27", "2027/28", "2028/29"], phase: "regular_season", currentMoment: "contract_delivery" });
  }
  it("consente il risultato finale da 1080 anche se il taglio separato arriverebbe a 1140", () => {
    const simpleCut = applyContextualContractCut(disabled, 2027, "contract_delivery");
    expect(warnings([salary, simpleCut])).not.toEqual([]);
    const stretched = applyContextualContractCut(disabled, 2027, "contract_delivery", 3);
    expect(stretched).toMatchObject({ state: "cut", slot: "regular", cost: 30, contract: "29", stretchProvisionApplied: true });
    expect(spaces([salary, stretched])).toEqual([-80, 970, 970]);
    expect(releaseCapSpaces({ kind: "cut", spacesBefore: [-50, 1000, 1000], contractCharges: [90, 0, 0], cutContractCharges: [30, 30, 30], currentDpeExemption: true }))
      .toEqual(spaces([salary, stretched]));
    expect(warnings([salary, stretched])).toEqual([]);
  });
  it("mantiene i limiti delle rate e il divieto dopo buyout o stretch già applicata", () => {
    expect(() => applyContextualContractCut({ ...disabled, contract: "28" }, 2027, "contract_delivery", 2)).toThrow(/non consentita/);
    expect(applyContextualContractCut({ ...disabled, contract: "28" }, 2027, "contract_delivery", 3).cost).toBe(60);
    for (const patch of [{ buyoutApplied: true }, { stretchProvisionApplied: true }, { contract: "29" }]) {
      expect(() => applyContextualContractCut({ ...disabled, ...patch }, 2027, "contract_delivery", 3)).toThrow(/non consentita/);
    }
  });
  it("non permette di risolvere il cap corrente violando quello futuro", () => {
    const after = salaryCapWarningsForSpaces({ before: [-50, 10, 1000], after: [-80, -20, 970], seasonNames: ["2026/27", "2027/28", "2028/29"], phase: "regular_season", currentMoment: "contract_delivery" });
    expect(after).toHaveLength(1);
    expect(after[0]).toContain("2027/28");
  });
});

describe("reintegro DPE anticipato", () => {
  const input = { rosterEntries: [disabled], teamCode: "AAA", playerName: disabled.name, seasonName: "2026/27", leagueMoment: "trade_deadline" as const };
  it("reintegra il solo giocatore scelto dalla deadline, conservando la storia DPE", () => {
    const other = { ...disabled, name: "Altra DPE" };
    const result = applyEarlyDpeReintegration({ ...input, rosterEntries: [disabled, other] });
    expect(result[0]).toMatchObject({ slot: "regular", dpeAppliedSeasons: ["2026/27"] });
    expect(result[0].dpeSeasonEndReintegratedSeasons).toBeUndefined();
    expect(result[1]).toEqual(other);
  });
  it("rispetta finestra operativa e disponibilità degli slot regolari", () => {
    for (const leagueMoment of ["offseason_start", "team_option_deadline", "auction_start", "auction_completed", "contract_delivery", "free_agency_end", "free_agency_reopening"] as const) {
      expect(() => applyEarlyDpeReintegration({ ...input, leagueMoment })).toThrow(/finestra/);
    }
    const full = Array.from({ length: 15 }, (_, i) => ({ ...target, name: `Roster ${i}` }));
    expect(() => applyEarlyDpeReintegration({ ...input, rosterEntries: [disabled, ...full] })).toThrow(/slot roster libero/);
    expect(() => applyEarlyDpeReintegration({ ...input, teamCode: "BBB" })).toThrow(/non è più nella DPE/);
  });

  it("rifiuta sul server logico anche un reintegro di una DPE successiva alla deadline", () => {
    const entries = applyDpeActivation({ ...input, rosterEntries: [target], playerName: target.name });
    expect(entries[0].dpeActivatedAfterDeadline).toBe(true);
    expect(() => applyEarlyDpeReintegration({ ...input, rosterEntries: entries, playerName: target.name }))
      .toThrow(/esercitata dopo la trade deadline/);
  });

  it("aggiorna il blocco a ogni nuovo esercizio senza riusare la vecchia idoneità", () => {
    const before = applyDpeActivation({ ...input, rosterEntries: [target], playerName: target.name, leagueMoment: "contract_delivery" });
    expect(before[0].dpeActivatedAfterDeadline).toBe(false);
    const early = applyEarlyDpeReintegration({ ...input, rosterEntries: before, playerName: target.name });
    expect(early[0].dpeActivatedAfterDeadline).toBeUndefined();
    const after = applyDpeActivation({ ...input, rosterEntries: early, playerName: target.name });
    expect(after[0].dpeActivatedAfterDeadline).toBe(true);
    expect(() => applyEarlyDpeReintegration({ ...input, rosterEntries: after, playerName: target.name })).toThrow(/non è consentito/);
  });
});
