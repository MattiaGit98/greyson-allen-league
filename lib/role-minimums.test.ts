import { describe, expect, it } from "vitest";
import { roleMinimumAffectedTeamCodes, roleMinimumChecksApply, roleMinimumRecoverySlotError, roleMinimumShortage, roleMinimumsWorsen } from "./role-minimums";

describe("roleMinimumShortage", () => {
  it("counts only active non-DPE players during the regular season", () => {
    const entries = [
      ...Array.from({ length: 4 }, (_, index) => ({ name: `G${index}`, role: "G" as const, state: "active" as const, slot: "regular" as const, teamCode: "AAA", cost: 1, contract: "27" })),
      ...Array.from({ length: 5 }, (_, index) => ({ name: `A${index}`, role: "A" as const, state: "active" as const, slot: "regular" as const, teamCode: "AAA", cost: 1, contract: "27" })),
      ...Array.from({ length: 3 }, (_, index) => ({ name: `C${index}`, role: "C" as const, state: "active" as const, slot: "regular" as const, teamCode: "AAA", cost: 1, contract: "27" })),
      { name: "DPE", role: "G" as const, state: "active" as const, slot: "dpe" as const, teamCode: "AAA", cost: 1, contract: "27" },
    ];
    expect(roleMinimumShortage(entries, "regular_season")).toEqual({ G: 1, A: 0, C: 0, total: 1 });
    expect(roleMinimumShortage(entries, "offseason")).toEqual({ G: 0, A: 0, C: 0, total: 0 });
  });

  it("recognizes only a newly worsened shortage", () => {
    const before = Array.from({ length: 5 }, (_, index) => ({ name: `G${index}`, role: "G" as const, state: "active" as const, slot: "regular" as const, teamCode: "AAA", cost: 1, contract: "27" }));
    const after = before.slice(1);
    expect(roleMinimumsWorsen(before, after, "regular_season")).toBe(true);
    expect(roleMinimumsWorsen(after, after, "regular_season")).toBe(false);
  });

  it("checks worsening team by team instead of compensating shortages across the league", () => {
    const guards = (teamCode: string, amount: number) => Array.from({ length: amount }, (_, index) => ({
      name: `${teamCode} G${index}`,
      role: "G" as const,
      state: "active" as const,
      slot: "regular" as const,
      teamCode,
      cost: 1,
      contract: "27",
    }));
    const before = [...guards("AAA", 5), ...guards("BBB", 6)];
    const after = [
      ...guards("AAA", 4),
      ...guards("BBB", 7),
    ];

    expect(roleMinimumsWorsen(before, after, "regular_season", "auction_completed")).toBe(true);
    expect(roleMinimumAffectedTeamCodes(before, after)).toEqual(["AAA", "BBB"]);
  });

  it("ignores an unchanged shortage belonging to a team outside the operation", () => {
    const unchangedShortage = [{ name: "AAA G", role: "G" as const, state: "active" as const, slot: "regular" as const, teamCode: "AAA", cost: 1, contract: "27" }];
    const before = [...unchangedShortage, { name: "BBB G", role: "G" as const, state: "active" as const, slot: "regular" as const, teamCode: "BBB", cost: 1, contract: "27" }];
    const after = before.map((entry) => entry.teamCode === "BBB" ? { ...entry, cost: 2 } : entry);

    expect(roleMinimumAffectedTeamCodes(before, after)).toEqual([]);
    expect(roleMinimumsWorsen(before, after, "regular_season", "auction_completed")).toBe(false);
  });

  it("keeps applying role minimums after the first free-agency window", () => {
    const entries = [{ name: "G", role: "G" as const, state: "active" as const, slot: "regular" as const, teamCode: "AAA", cost: 1, contract: "27" }];
    expect(roleMinimumShortage(entries, "regular_season", "free_agency_end").total).toBe(12);
  });

  it("applies role minimums from the auction end through the end of the season", () => {
    expect(roleMinimumChecksApply("offseason", "team_option_deadline")).toBe(false);
    expect(roleMinimumChecksApply("offseason", "auction_start")).toBe(false);
    expect(roleMinimumChecksApply("regular_season", "auction_completed")).toBe(true);
    expect(roleMinimumChecksApply("regular_season", "free_agency_end")).toBe(true);
    expect(roleMinimumChecksApply("regular_season", "free_agency_reopening")).toBe(true);
    expect(roleMinimumChecksApply("offseason", "offseason_start")).toBe(false);
  });

  it("counts the DPE only from the reopening of free agency", () => {
    const entries = [
      ...Array.from({ length: 4 }, (_, index) => ({ name: `G${index}`, role: "G" as const, state: "active" as const, slot: "regular" as const, teamCode: "AAA", cost: 1, contract: "28" })),
      ...Array.from({ length: 5 }, (_, index) => ({ name: `A${index}`, role: "A" as const, state: "active" as const, slot: "regular" as const, teamCode: "AAA", cost: 1, contract: "28" })),
      ...Array.from({ length: 3 }, (_, index) => ({ name: `C${index}`, role: "C" as const, state: "active" as const, slot: "regular" as const, teamCode: "AAA", cost: 1, contract: "28" })),
      { name: "Guardia DPE", role: "G" as const, state: "active" as const, slot: "dpe" as const, teamCode: "AAA", cost: 1, contract: "28" },
    ];
    expect(roleMinimumShortage(entries, "regular_season", "free_agency_end").G).toBe(1);
    expect(roleMinimumShortage(entries, "regular_season", "free_agency_reopening").G).toBe(0);
  });

  it("counts regular, Two-way and G-League together for a 7-4-6 roster", () => {
    const roles = [
      ...Array.from({ length: 7 }, () => "G" as const),
      ...Array.from({ length: 4 }, () => "A" as const),
      ...Array.from({ length: 6 }, () => "C" as const),
    ];
    const entries = roles.map((role, index) => ({
      name: `Player ${index}`,
      role,
      state: "active" as const,
      slot: index < 12 ? "regular" as const : index < 14 ? "two_way" as const : "g_league" as const,
      teamCode: "AAA",
      cost: 1,
      contract: "28",
    }));

    expect(roleMinimumShortage(entries, "regular_season", "auction_completed")).toEqual({ G: 0, A: 1, C: 0, total: 1 });
  });

  it("reports when roster and two-way slots cannot cover every missing role", () => {
    expect(roleMinimumRecoverySlotError({ G: 1, A: 1, C: 0, total: 2 }, { regular: 15, twoWay: 1 })).toMatch(/Servono 2 slot/);
    expect(roleMinimumRecoverySlotError({ G: 1, A: 0, C: 0, total: 1 }, { regular: 15, twoWay: 1 })).toBeNull();
  });
});
