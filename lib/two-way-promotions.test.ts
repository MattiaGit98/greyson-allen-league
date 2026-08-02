import { describe, expect, it } from "vitest";
import type { RosterEntry, TeamSummary } from "@/lib/league-types";
import { applyMandatoryTwoWayPromotion, buildTwoWayPromotionReport, requiresMandatoryTwoWayPromotion } from "./two-way-promotions";

const team = { code: "AAA", name: "Alpha", owner: "A" } as TeamSummary;

function entry(patch: Partial<RosterEntry>): RosterEntry {
  return {
    name: "Giocatore",
    cost: 5,
    contract: "28",
    role: "G",
    state: "active",
    slot: "two_way",
    teamCode: "AAA",
    ...patch,
  };
}

describe("promozioni obbligatorie Two-way", () => {
  it("include i contratti al secondo anno ma non le team option", () => {
    expect(requiresMandatoryTwoWayPromotion(entry({ contract: "28", contractStartSeason: "2025/26" }), "2026/27")).toBe(true);
    expect(requiresMandatoryTwoWayPromotion(entry({ contract: "28", contractStartSeason: "2026/27" }), "2026/27")).toBe(false);
    expect(requiresMandatoryTwoWayPromotion(entry({ contract: "T.O.", contractStartSeason: "2025/26" }), "2026/27")).toBe(false);
  });

  it("non promuove una seconda volta chi ha terminato la stagione in G-League ed è appena salito nei Two-way", () => {
    expect(requiresMandatoryTwoWayPromotion(entry({
      contract: "28 (2X)",
      contractStartSeason: "2025/26",
      teamOptionFinalYear: 2028,
      endedPreviousSeasonInGLeague: true,
    }), "2026/27")).toBe(false);
  });

  it("promuove nel roster la T.O. esercitata per utilizzo nei playoff soltanto nell'annata prevista", () => {
    const playoffOption = entry({
      contract: "29 (2X)",
      slot: "g_league",
      endedPreviousSeasonInGLeague: true,
      playoffTeamOptionPromotionSeason: "2027/28",
    });
    expect(requiresMandatoryTwoWayPromotion(playoffOption, "2026/27")).toBe(false);
    expect(requiresMandatoryTwoWayPromotion(playoffOption, "2027/28")).toBe(true);
    expect(applyMandatoryTwoWayPromotion(playoffOption, "2027/28")).toMatchObject({
      slot: "regular",
      twoWayPromotionLocked: true,
    });
    expect(applyMandatoryTwoWayPromotion(playoffOption, "2027/28").playoffTeamOptionPromotionSeason).toBeUndefined();
  });

  it("calcola gli slot regolari mancanti per squadra", () => {
    const roster = [
      ...Array.from({ length: 14 }, (_, index) => entry({ name: `Roster ${index}`, slot: "regular" })),
      entry({ name: "Two-way 1" }),
      entry({ name: "Two-way 2" }),
    ];
    const report = buildTwoWayPromotionReport([team], roster, "2026/27");
    expect(report.totalPlayers).toBe(2);
    expect(report.totalShortfall).toBe(1);
    expect(report.blockedTeams[0]?.regularSlotsAvailable).toBe(1);
  });

  it("promuove nel roster e impedisce di annullare la promozione con la finestra del Draft", () => {
    expect(applyMandatoryTwoWayPromotion(
      entry({ contract: "28", contractStartSeason: "2025/26" }),
      "2026/27",
    )).toMatchObject({ slot: "regular", twoWayPromotionLocked: true });
  });
});
