import { describe, expect, it } from "vitest";
import type { RosterEntry } from "./league-types";
import type { EditableLeagueState } from "./league-state";
import { buildPreAdvanceChecklist } from "./pre-advance-alerts";
import type { PostAuctionContractDraft } from "./post-auction-contracts";

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
  };
}

describe("avvisi prima dell’avanzamento della lega", () => {
  it("alla scadenza T.O. segnala le opzioni pendenti ma non promuove ancora i Two-way al secondo anno", () => {
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
    expect(result.alerts.map((alert) => alert.id)).toContain("pending-team-options");
    expect(result.alerts.find((alert) => alert.id === "pending-team-options")?.tone).toBe("blocker");
    expect(result.alerts.find((alert) => alert.id === "blocked-offseason-roster-moves")).toBeUndefined();
    expect(result.blockerCount).toBeGreaterThan(0);
  });

  it("prima di Inizio asta richiede listone, ordine definitivo e Draft completato", () => {
    const current = state();
    current.playerListStatus = "offseason";
    current.draftAssets = [{
      label: "Scelta",
      round: "1\u00b0 giro",
      year: 2026,
      originOrOverall: 1,
      teamCode: "AAA",
      originTeamCode: "AAA",
    }];

    const result = buildPreAdvanceChecklist({
      currentMoment: "team_option_deadline",
      seasonName: "2026/27",
      state: current,
    });

    expect(result.transition).toBe("auction_start");
    expect(result.alerts.filter((alert) => alert.tone === "blocker").map((alert) => alert.id)).toEqual(expect.arrayContaining([
      "official-list-draft",
      "draft-positions-incomplete",
      "draft-required-before-auction",
    ]));
  });

  it("prima della chiusura dell’asta controlla Draft e roster minimo", () => {
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
      currentMoment: "auction_start",
      seasonName: "2026/27",
      state: current,
    });
    expect(result.alerts.filter((alert) => alert.tone === "blocker").map((alert) => alert.id)).toEqual(expect.arrayContaining([
      "draft-not-completed",
      "auction-rosters-incomplete",
      "role-minimums",
    ]));
    expect(result.alerts.map((alert) => alert.id)).not.toContain("qualifying-offers-unresolved");
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

  it("considera assegnato un contratto soltanto quando esiste la bozza privata", () => {
    const current = state([
      rosterEntry("In bozza", {
        contract: "PENDING",
        auctionPrice: 10,
        contractStartSeason: "2026/27",
      }),
    ]);
    current.playerList = [{ name: "In bozza", role: "G", realTeam: "", rookie: false, under23: false }];
    const contractDrafts: PostAuctionContractDraft[] = [{
      seasonName: "2026/27",
      teamCode: "AAA",
      playerName: "In bozza",
      contractKind: "annual",
      slot: "regular",
    }];
    const result = buildPreAdvanceChecklist({
      currentMoment: "auction_completed",
      seasonName: "2026/27",
      state: current,
      contractDrafts,
    });
    expect(result.alerts.find((alert) => alert.id === "pending-contracts")).toBeUndefined();
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
      currentMoment: "free_agency_reopening",
      seasonName: "2026/27",
      state: current,
      currentHistorySeason: "2026/27",
    });
    expect(result.alerts.find((alert) => alert.id === "blocked-offseason-roster-moves")?.tone).toBe("blocker");
  });

  it("non promuove automaticamente un Two-way al secondo anno in attesa della decisione", () => {
    const current = state([
      ...Array.from({ length: 15 }, (_, index) => rosterEntry(`Roster ${index}`)),
      rosterEntry("Secondo anno", { slot: "two_way", contractStartSeason: "2025/26" }),
    ]);
    const result = buildPreAdvanceChecklist({
      currentMoment: "free_agency_reopening",
      seasonName: "2026/27",
      state: current,
      currentHistorySeason: "2026/27",
    });
    const alert = result.alerts.find((item) => item.id === "blocked-offseason-roster-moves");
    expect(alert).toBeUndefined();
  });

  it("blocca la fine della stagione se una T.O. playoff non ha spazio per salire nel roster", () => {
    const exercised = rosterEntry("T.O. playoff", {
      slot: "g_league",
      contract: "28 + R.E.",
      playoffTeamOptionPromotionSeason: "2027/28",
    });
    const seasonEndChecklist = buildPreAdvanceChecklist({
      currentMoment: "free_agency_reopening",
      seasonName: "2026/27",
      state: state([
        ...Array.from({ length: 15 }, (_, index) => rosterEntry(`Roster ${index}`)),
        exercised,
      ]),
      currentHistorySeason: "2026/27",
    });
    const alert = seasonEndChecklist.alerts.find((item) => item.id === "blocked-offseason-roster-moves");
    expect(alert?.tone).toBe("blocker");
    expect(alert?.items?.join(" ")).toContain("T.O. playoff (T.O. playoff)");
  });
});
