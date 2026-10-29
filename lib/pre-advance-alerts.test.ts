import { describe, expect, it } from "vitest";
import type { RosterEntry } from "./league-types";
import type { EditableLeagueState } from "./league-state";
import { buildPreAdvanceChecklist } from "./pre-advance-alerts";
import { buildLeagueTransitionPreview } from "./league-transition";
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
  it("alla trade deadline chiude solo gli scambi e non annuncia più la perdita della Q.O. dei FA", () => {
    const result = buildPreAdvanceChecklist({ currentMoment: "contract_delivery", seasonName: "2026/27", state: state() });
    const alert = result.alerts.find((alert) => alert.id === "trade-deadline-closures");
    expect(alert?.title).toBe("Il prossimo avanzamento chiude gli scambi");
    expect(alert?.message).toContain("La DPE resta esercitabile");
    expect(alert?.message).toContain("reintegro anticipato delle sole DPE esercitate prima della trade deadline");
    expect(alert?.message).not.toContain("senza Q.O.");
    expect(alert?.article).toBe("Art. 12(a); Art. 13(a)");
  });

  it("annuncia esercizio e reintegro DPE in chiusura solo alla fine della prima free agency", () => {
    const result = buildPreAdvanceChecklist({ currentMoment: "buyout_end", seasonName: "2026/27", state: state() });
    const alert = result.alerts.find((alert) => alert.id === "free-agency-closures");
    expect(alert?.message).toContain("esercizio e reintegro anticipato della DPE");
    expect(alert?.article).toBe("Art. 5(a); Art. 10(b); Art. 12(a,d)");
    const buyout = buildPreAdvanceChecklist({ currentMoment: "trade_deadline", seasonName: "2026/27", state: state() });
    expect(buyout.alerts.find((alert) => alert.id === "buyout-window-closing")?.article).toBe("Art. 10(e); Art. 9(c)");
  });

  it("riferisce la garanzia delle T.O. da 1 credito al comma rinumerato", () => {
    const result = buildPreAdvanceChecklist({ currentMoment: "auction_completed", seasonName: "2026/27",
      state: state([rosterEntry("Team option da 1", { contract: "27 + T.O." })]) });
    expect(result.alerts.find((alert) => alert.id === "one-credit-options-guarantee")?.article).toBe("Art. 10(d)");
  });
  it("blocca l'avanzamento se il team salary di una stagione futura supera 1000", () => {
    const input = {
      currentMoment: "contract_delivery",
      seasonName: "2026/27",
      state: state([rosterEntry("Contratto futuro", { cost: 1001, contract: "28" })]),
    } as const;
    const result = buildPreAdvanceChecklist(input);
    expect(result.alerts.find((alert) => alert.id === "future-cap-overflow")?.tone).toBe("blocker");
    expect(buildLeagueTransitionPreview(input).errors.join(" ")).toContain("Team salary futuro oltre 1000 crediti");
  });

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
      "role-minimums",
    ]));
    expect(result.alerts.find((alert) => alert.id === "role-minimums")).toMatchObject({
      title: "1 squadra non completa",
    });
    expect(result.alerts.map((alert) => alert.id)).not.toContain("qualifying-offers-unresolved");
  });

  it("blocca il Termine asta anche con almeno 13 giocatori se manca un ruolo", () => {
    const roles = [
      ...Array.from({ length: 7 }, () => "G" as const),
      ...Array.from({ length: 4 }, () => "A" as const),
      ...Array.from({ length: 6 }, () => "C" as const),
    ];
    const current = state(roles.map((role, index) => rosterEntry(`Player ${index}`, {
      role,
      slot: index < 12 ? "regular" : index < 14 ? "two_way" : "g_league",
    })));
    current.playerList = roles.map((role, index) => ({
      name: `Player ${index}`,
      role,
      realTeam: "",
      rookie: false,
      under23: false,
    }));

    const result = buildPreAdvanceChecklist({
      currentMoment: "auction_start",
      seasonName: "2026/27",
      state: current,
    });

    expect(result.alerts.find((alert) => alert.id === "role-minimums")).toMatchObject({
      tone: "blocker",
      items: ["AAA: 1 A"],
    });
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
    expect(result.alerts.find((alert) => alert.id === "pending-contracts")?.items?.join(" ")).toContain("Da firmare");
    expect(result.alerts.find((alert) => alert.id === "pending-contracts")?.items?.join(" ")).not.toContain("Tagliato da firmare");
  });

  it("non conta due volte come non idoneo chi attende ancora il contratto in uno slot speciale", () => {
    const current = state([
      rosterEntry("Two-way da firmare", {
        contract: "PENDING",
        slot: "two_way",
        auctionPrice: 5,
        contractStartSeason: "2026/27",
      }),
    ]);
    const result = buildPreAdvanceChecklist({
      currentMoment: "auction_completed",
      seasonName: "2026/27",
      state: current,
    });

    expect(result.alerts.find((alert) => alert.id === "pending-contracts")?.items)
      .toContain("AAA: Two-way da firmare");
    expect(result.alerts.find((alert) => alert.id === "invalid-special-slot-contracts")).toBeUndefined();
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

  it("segnala prima della consegna anche il contratto da assegnare da 1 eleggibile per la T.O.", () => {
    const current = state([
      rosterEntry("Rookie da liberare", {
        contract: "PENDING",
        auctionPrice: 1,
        contractStartSeason: "2026/27",
      }),
    ]);
    current.playerList = [{ name: "Rookie da liberare", role: "G", realTeam: "", rookie: true, under23: false }];

    const result = buildPreAdvanceChecklist({
      currentMoment: "auction_completed",
      seasonName: "2026/27",
      state: current,
    });

    expect(result.alerts.find((alert) => alert.id === "one-credit-options-guarantee")?.items)
      .toContain("AAA: Rookie da liberare");
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

  it("consente la Fine stagione quando un taglio programmato risolve l'eccedenza", () => {
    const current = state([
      ...Array.from({ length: 15 }, (_, index) => rosterEntry(`Roster ${index}`, index === 0 ? { scheduledSeasonEndCut: "2026/27" } : {})),
      rosterEntry("In DPE", { slot: "dpe" }),
    ]);
    const result = buildPreAdvanceChecklist({
      currentMoment: "free_agency_reopening",
      seasonName: "2026/27",
      state: current,
      currentHistorySeason: "2026/27",
    });
    expect(result.alerts.find((alert) => alert.id === "blocked-offseason-roster-moves")).toBeUndefined();
    expect(result.alerts.find((alert) => alert.id === "scheduled-season-end-cuts")?.items).toContain("AAA: Roster 0");
  });

  it("blocca programmazioni divenute inutili o numericamente eccedenti", () => {
    const invalidState = state([
      rosterEntry("In scadenza", { contract: "27", scheduledSeasonEndCut: "2026/27" }),
    ]);
    const invalid = buildPreAdvanceChecklist({
      currentMoment: "free_agency_reopening",
      seasonName: "2026/27",
      state: invalidState,
      currentHistorySeason: "2026/27",
    });
    expect(invalid.alerts.find((alert) => alert.id === "invalid-scheduled-season-end-cuts")?.tone).toBe("blocker");

    const excessiveState = state([
      ...Array.from({ length: 15 }, (_, index) => rosterEntry(`Roster ${index}`, index < 2 ? { scheduledSeasonEndCut: "2026/27" } : {})),
      rosterEntry("In DPE", { slot: "dpe" }),
    ]);
    const excessive = buildPreAdvanceChecklist({
      currentMoment: "free_agency_reopening",
      seasonName: "2026/27",
      state: excessiveState,
      currentHistorySeason: "2026/27",
    });
    expect(excessive.alerts.find((alert) => alert.id === "excessive-scheduled-season-end-cuts")?.tone).toBe("blocker");
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

  it("non blocca la fine della stagione per una T.O. playoff ancora in G-League", () => {
    const exercised = rosterEntry("T.O. playoff", {
      slot: "g_league",
      contract: "27 + T.O.",
      playoffTeamOptionUsedSeason: "2026/27",
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
    expect(alert).toBeUndefined();
  });

  it("ricorda la verifica playoff prima della riapertura, senza imporre una segnalazione", () => {
    const result = buildPreAdvanceChecklist({
      currentMoment: "free_agency_end",
      seasonName: "2026/27",
      state: state([rosterEntry("G-League", { slot: "g_league", contract: "27 + T.O." })]),
      currentHistorySeason: "2026/27",
    });
    expect(result.alerts.find((alert) => alert.id === "playoff-team-option-verification")?.tone).toBe("warning");
  });
});
