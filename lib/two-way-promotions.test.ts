import { describe, expect, it } from "vitest";
import type { RosterEntry } from "@/lib/league-types";
import { applyPlayoffTeamOptionPromotion, requiresPlayoffTeamOptionPromotion } from "./two-way-promotions";

function entry(patch: Partial<RosterEntry>): RosterEntry {
  return {
    name: "Giocatore",
    cost: 5,
    contract: "28 + R.E.",
    role: "G",
    state: "active",
    slot: "g_league",
    teamCode: "AAA",
    ...patch,
  };
}

describe("promozione della T.O. esercitata nei playoff", () => {
  it("la applica soltanto all'inizio dell'offseason prevista", () => {
    const playoffOption = entry({ playoffTeamOptionPromotionSeason: "2027/28" });
    expect(requiresPlayoffTeamOptionPromotion(playoffOption, "2026/27")).toBe(false);
    expect(requiresPlayoffTeamOptionPromotion(playoffOption, "2027/28")).toBe(true);
    expect(applyPlayoffTeamOptionPromotion(playoffOption, "2027/28")).toMatchObject({
      slot: "regular",
      twoWayPromotionLocked: true,
    });
    expect(applyPlayoffTeamOptionPromotion(playoffOption, "2027/28").playoffTeamOptionPromotionSeason).toBeUndefined();
  });

  it("lascia negli slot speciali gli altri giocatori in attesa della decisione", () => {
    expect(applyPlayoffTeamOptionPromotion(entry({ playoffTeamOptionPromotionSeason: undefined }), "2027/28")).toMatchObject({
      slot: "g_league",
      contract: "28 + R.E.",
    });
  });
});
