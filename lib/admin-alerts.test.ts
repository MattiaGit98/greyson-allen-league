import { describe, expect, it } from "vitest";
import { buildRoleMinimumAlerts, formatRoleMinimumMissing } from "./admin-alerts";
import type { EditableLeagueState } from "./league-state";

function state(status: EditableLeagueState["playerListStatus"]): EditableLeagueState {
  return {
    playerListStatus: status,
    playerList: [
      { name: "Guardia", role: "G", realTeam: "", rookie: false, under23: false },
      { name: "Centro", role: "C", realTeam: "", rookie: false, under23: false },
      { name: "Senza ruolo", role: "X", realTeam: "", rookie: false, under23: false },
    ],
    teams: [{ code: "AAA", name: "Alpha", owner: "A", credits: 0, cost: 0, players: 0, cutPlayers: 0, qualifyingOffers: 0, draftAssets: 0, nextSeasonCredits: 0, followingSeasonCredits: 0, slug: "aaa" }],
    rosterEntries: [
      { name: "Guardia", teamCode: "AAA", role: "G", cost: 1, contract: "27", state: "active", slot: "regular" },
      { name: "Assente", teamCode: "AAA", role: "A", cost: 1, contract: "27", state: "active", slot: "regular" },
      { name: "Centro", teamCode: "AAA", role: "C", cost: 1, contract: "27", state: "active", slot: "dpe" },
      { name: "Senza ruolo", teamCode: "AAA", cost: 1, contract: "27", state: "active", slot: "regular" },
    ],
    draftAssets: [],
    qualifyingOfferRights: [],
  };
}

describe("admin list and roster alerts", () => {
  it("counts only active non-DPE players with an official G/A/C role", () => {
    expect(buildRoleMinimumAlerts(state("published"))[0]).toMatchObject({
      teamCode: "AAA",
      counts: { G: 1, A: 0, C: 0 },
      missing: { G: 4, A: 5, C: 3 },
    });
  });

  it("includes an active DPE after free agency reopens", () => {
    expect(buildRoleMinimumAlerts(state("published"), "free_agency_reopening")[0]).toMatchObject({
      counts: { G: 1, A: 0, C: 1 },
      missing: { G: 4, A: 5, C: 2 },
    });
  });

  it("counts roster, Two-way and G-League together and reports only the missing role", () => {
    const current = state("published");
    const roles = [
      ...Array.from({ length: 7 }, () => "G" as const),
      ...Array.from({ length: 4 }, () => "A" as const),
      ...Array.from({ length: 6 }, () => "C" as const),
    ];
    current.playerList = roles.map((role, index) => ({ name: `Player ${index}`, role, realTeam: "", rookie: false, under23: false }));
    current.rosterEntries = roles.map((role, index) => ({
      name: `Player ${index}`,
      teamCode: "AAA",
      role,
      cost: 1,
      contract: "27",
      state: "active" as const,
      slot: index < 12 ? "regular" as const : index < 14 ? "two_way" as const : "g_league" as const,
    }));

    const alert = buildRoleMinimumAlerts(current, "auction_start")[0];
    expect(alert).toMatchObject({
      counts: { G: 7, A: 4, C: 6 },
      missing: { G: 0, A: 1, C: 0 },
    });
    expect(formatRoleMinimumMissing(alert)).toBe("1 A");
  });
});
