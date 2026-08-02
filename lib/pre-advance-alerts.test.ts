import { describe, expect, it } from "vitest";
import type { RosterEntry } from "./league-types";
import type { EditableLeagueState } from "./league-state";
import { buildPreAdvanceChecklist } from "./pre-advance-alerts";

function rosterEntry(name: string, patch: Partial<RosterEntry> = {}): RosterEntry {
  return {
    name,
    teamCode: "AAA",
    role: "G",
    cost: 1,
    contract: "28",
    state: "active",
    slot: "regular",
    ...patch,
  };
}

function state(rosterEntries: RosterEntry[] = []): EditableLeagueState {
  return {
    teams: [{
      code: "AAA",
      name: "Alpha",
      owner: "A",
      credits: 0,
      cost: 0,
      players: 0,
      cutPlayers: 0,
      qualifyingOffers: 0,
      draftAssets: 0,
      nextSeasonCredits: 0,
      followingSeasonCredits: 0,
      slug: "aaa",
    }],
    rosterEntries,
    draftAssets: [],
    qualifyingOfferRights: [],
    playerList: [],
    playerListStatus: "published",
    draftOrders: [],
    draftPositionYears: [],
  };
}

describe("avvisi prima dell’avanzamento della lega", () => {
  it("segnala T.O. pendenti e promozioni Two-way senza spazio", () => {
    const current = state([
      ...Array.from({ length: 15 }, (_, index) => rosterEntry(`Roster ${index}`)),
      rosterEntry("Secondo anno", { slot: "two_way" }),
      rosterEntry("Opzione", { slot: "g_league", contract: "T.O." }),
    ]);
    const result = buildPreAdvanceChecklist({
      currentMoment: "offseason_start",
      seasonName: "2026/27",
      state: current,
    });
    expect(result.transition).toBe("team_option_deadline");
    expect(result.alerts.map((alert) => alert.id)).toEqual(expect.arrayContaining([
      "pending-team-options",
      "blocked-two-way-promotions",
    ]));
    expect(result.alerts.find((alert) => alert.id === "pending-team-options")?.tone).toBe("blocker");
    expect(result.alerts.find((alert) => alert.id === "blocked-two-way-promotions")?.tone).toBe("blocker");
    expect(result.blockerCount).toBeGreaterThan(0);
  });

  it("prima della chiusura dell’asta controlla Draft, Q.O. e roster minimo", () => {
    const current = state(Array.from({ length: 12 }, (_, index) => rosterEntry(`Roster ${index}`)));
    current.draftAssets = [{
      label: "Scelta",
      round: "1\u00b0 giro",
      year: 2026,
      originOrOverall: 1,
      teamCode: "AAA",
      originTeamCode: "AAA",
    }];
    current.qualifyingOfferRights = [{ playerName: "Qualifying", qualifyingAmount: 3, teamCode: "AAA" }];
    const result = buildPreAdvanceChecklist({
      currentMoment: "free_releases_start",
      seasonName: "2026/27",
      state: current,
    });
    expect(result.alerts.filter((alert) => alert.tone === "blocker").map((alert) => alert.id)).toEqual(expect.arrayContaining([
      "draft-not-completed",
      "qualifying-offers-unresolved",
      "auction-rosters-incomplete",
    ]));
  });

  it("blocca la consegna se restano contratti dell’asta da assegnare", () => {
    const current = state([
      rosterEntry("Da firmare", { contract: "PENDING" }),
      rosterEntry("Tagliato da firmare", { contract: "PENDING", state: "cut" }),
    ]);
    const result = buildPreAdvanceChecklist({
      currentMoment: "auction_completed",
      seasonName: "2026/27",
      state: current,
    });
    expect(result.alerts.find((alert) => alert.id === "pending-contracts")?.tone).toBe("blocker");
    expect(result.alerts.find((alert) => alert.id === "pending-contracts")?.items?.join(" ")).toContain("Tagliato da firmare");
  });

  it("alla consegna accetta nei Two-way un free agent della stagione ma blocca chi non ha una categoria ammessa", () => {
    const current = state([
      rosterEntry("Free agent idoneo", { slot: "two_way", contract: "27 (Q)", cost: 8, freeAgentSignedSeason: "2026/27" }),
      rosterEntry("Non idoneo", { slot: "two_way", contract: "27", cost: 8 }),
    ]);
    const result = buildPreAdvanceChecklist({
      currentMoment: "auction_completed",
      seasonName: "2026/27",
      state: current,
    });
    const alert = result.alerts.find((item) => item.id === "invalid-special-slot-contracts");
    expect(alert?.tone).toBe("blocker");
    expect(alert?.items?.join(" ")).toContain("Non idoneo");
    expect(alert?.items?.join(" ")).not.toContain("Free agent idoneo");
  });

  it("blocca la fine della stagione quando il reintegro DPE supera gli slot roster", () => {
    const current = state([
      ...Array.from({ length: 15 }, (_, index) => rosterEntry(`Roster ${index}`)),
      rosterEntry("In DPE", { slot: "dpe" }),
    ]);
    const result = buildPreAdvanceChecklist({
      currentMoment: "free_agency_end",
      seasonName: "2026/27",
      state: current,
      currentHistorySeason: "2026/27",
    });
    expect(result.alerts.find((alert) => alert.id === "blocked-dpe-reintegrations")?.tone).toBe("blocker");
  });

  it("traccia l'esercizio playoff e blocca la successiva scadenza T.O. se manca lo slot roster", () => {
    const exercised = rosterEntry("T.O. playoff", {
      slot: "g_league",
      contract: "29 (2X)",
      playoffTeamOptionPromotionSeason: "2027/28",
    });
    const seasonEndChecklist = buildPreAdvanceChecklist({
      currentMoment: "free_agency_end",
      seasonName: "2026/27",
      state: state([exercised]),
      currentHistorySeason: "2026/27",
    });
    expect(seasonEndChecklist.alerts.find((alert) => alert.id === "playoff-team-option-promotions")?.tone).toBe("info");

    const nextOffseason = buildPreAdvanceChecklist({
      currentMoment: "offseason_start",
      seasonName: "2027/28",
      state: state([
        ...Array.from({ length: 15 }, (_, index) => rosterEntry(`Roster ${index}`)),
        exercised,
      ]),
    });
    expect(nextOffseason.alerts.find((alert) => alert.id === "blocked-two-way-promotions")?.tone).toBe("blocker");
  });
});
