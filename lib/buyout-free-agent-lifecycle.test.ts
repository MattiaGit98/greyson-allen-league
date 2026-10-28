import { describe, expect, it } from "vitest";
import type { RosterEntry } from "./league-types";
import { emptyLeagueState } from "./league-state";
import { applyBuyout, releaseCapSpaces, type ThreeYearValues } from "./release-operations";
import { calculateCapSpace, followingSeasonName } from "./season-time";
import { entriesForDpeAdjustedCap } from "./dpe-rules";
import { salaryCapWarningsForSpaces } from "./cap-override";
import { buildMovementReversal } from "./league-movements";
import { automaticFreeAgentContract } from "./rules/free-agent";
import { calculateLeagueAdvance } from "./league-advance";
import { operationWindows } from "./league-moments";
import { buildPublicPlayerListRows, publicPlayerStatus } from "./public-player-list";
import { allowedStretchYears } from "./stretch-provision";

const seasonName = "2026/27";
const entry: RosterEntry = {
  name: "Pluriennale", cost: 47, contract: "29 (E)", role: "G", state: "active", slot: "regular", teamCode: "AAA",
};
function spaces(entries: RosterEntry[]): ThreeYearValues {
  return [0, 1, 2].map((distance) => calculateCapSpace({
    entries: entriesForDpeAdjustedCap(entries, distance),
    seasonName: followingSeasonName(seasonName, distance), optionSeasonName: seasonName, countTeamOptions: true,
  })) as ThreeYearValues;
}

describe("ciclo buyout e nuove firme FA", () => {
  it.each(["regular", "dpe"] as const)("allinea anteprima e cap effettivo per il buyout dallo slot %s", (slot) => {
    const original = { ...entry, slot };
    const after = applyBuyout(original, 2027, [47, 47, 47]);
    expect(after.cost).toBe(113);
    expect(spaces([after])).toEqual([887, 1000, 1000]);
    expect(releaseCapSpaces({ kind: "buyout", spacesBefore: spaces([original]),
      contractCharges: [47, 47, 47], currentDpeExemption: slot === "dpe" })).toEqual(spaces([after]));
  });

  it.each([[887, false], [888, true]] as const)("mantiene il vincolo cap a 1000 dopo lo sconto, con altri costi %i", (otherCost, blocked) => {
    const other = { ...entry, name: "Altro contratto", cost: otherCost, contract: "27" };
    const after = applyBuyout(entry, 2027, [47, 47, 47]);
    const warnings = salaryCapWarningsForSpaces({ before: spaces([entry, other]), after: spaces([after, other]),
      phase: "regular_season", currentMoment: "auction_completed", currentLimit: 1000,
      seasonNames: [seasonName, "2027/28", "2028/29"] });
    expect(warnings.length > 0).toBe(blocked);
  });

  it("annulla e ripristina il buyout con costo e metadati completi", () => {
    const before = { ...emptyLeagueState(), rosterEntries: [entry] };
    const after = { ...before, rosterEntries: [applyBuyout(entry, 2027, [47, 47, 47])] };
    const unrelated = { ...entry, name: "Operazione successiva", teamCode: "BBB", contract: "27" };
    const current = { ...after, rosterEntries: [...after.rosterEntries, unrelated] };
    const restored = buildMovementReversal(current, before, after);
    expect(restored.rosterEntries).toEqual([entry, unrelated]);
    expect(buildMovementReversal(restored, after, before).rosterEntries).toEqual(current.rosterEntries);
  });

  it("non altera un vecchio buyout o il suo divieto di stretch rimuovendo il bollino dal FA", () => {
    const oldBuyout: RosterEntry = { ...entry, state: "cut", contract: "27", cost: 141, buyoutApplied: true };
    const rows = buildPublicPlayerListRows({ playerList: [{ name: entry.name, role: "G", realTeam: "", rookie: false, under23: false }],
      rosterEntries: [oldBuyout], qualifyingOfferRights: [] });
    expect(publicPlayerStatus(rows[0], seasonName, true)).toBe("fa");
    expect(rows[0]).not.toHaveProperty("buyoutApplied");
    expect(oldBuyout.cost).toBe(141);
    expect(allowedStretchYears(oldBuyout, 2027)).toEqual([]);
    expect(spaces([oldBuyout])).toEqual([859, 1000, 1000]);
  });

  it.each(["contract_delivery", "trade_deadline", "free_agency_reopening"] as const)("genera la Q.O. delle nuove firme ordinarie a %s, anche nei Two-way", (moment) => {
    expect(operationWindows.freeAgency(moment)).toBe(true);
    const entries: RosterEntry[] = [
      { ...entry, name: "Firma ordinaria", contract: automaticFreeAgentContract(seasonName)!, cost: 5, slot: "two_way", freeAgentSignedSeason: seasonName },
      { ...entry, name: "Carenza ruoli", contract: automaticFreeAgentContract(seasonName, true)!, cost: 1 },
      { ...entry, name: "Firma già registrata", contract: "27", cost: 7 },
    ];
    const advanced = calculateLeagueAdvance({ seasonName, rosterEntries: entries, playerList: [], qualifyingOfferRights: [] });
    expect(advanced.qualifyingOfferRights).toEqual([{ playerName: "Firma ordinaria", qualifyingAmount: 5, teamCode: "AAA", role: "G" }]);
    expect(advanced.rosterEntries).toEqual([]);
  });
});
