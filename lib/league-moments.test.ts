import { describe, expect, it } from "vitest";
import {
  leagueMomentFromSeason,
  macroPhaseForMoment,
  nextLeagueTransition,
  operationWindows,
} from "./league-moments";

describe("momenti della lega", () => {
  it("mantiene compatibili le vecchie fasi", () => {
    expect(leagueMomentFromSeason({ status: "offseason", team_options_resolved: false })).toBe("offseason_start");
    expect(leagueMomentFromSeason({ status: "regular_season", trade_deadline_passed: true })).toBe("trade_deadline");
  });

  it("passa alla stagione al termine dell'asta", () => {
    expect(macroPhaseForMoment("free_releases_start")).toBe("offseason");
    expect(macroPhaseForMoment("auction_completed")).toBe("regular_season");
  });

  it("apre e chiude le finestre operative", () => {
    expect(operationWindows.teamOption("offseason_start")).toBe(true);
    expect(operationWindows.teamOption("team_option_deadline")).toBe(false);
    expect(operationWindows.playoffTeamOption("buyout_end")).toBe(false);
    expect(operationWindows.playoffTeamOption("free_agency_end")).toBe(true);
    expect(operationWindows.freeAgency("contract_delivery")).toBe(true);
    expect(operationWindows.freeAgency("free_agency_end")).toBe(false);
    expect(operationWindows.buyout("trade_deadline")).toBe(true);
    expect(operationWindows.buyout("buyout_end")).toBe(false);
    expect(operationWindows.dpeActivation("offseason_start")).toBe(true);
    expect(operationWindows.dpeActivation("team_option_deadline")).toBe(true);
    expect(operationWindows.dpeActivation("free_releases_start")).toBe(false);
    expect(operationWindows.dpeActivation("auction_completed")).toBe(true);
    expect(operationWindows.dpeActivation("trade_deadline")).toBe(false);
    expect(operationWindows.dpeReintegration("auction_completed")).toBe(false);
    expect(operationWindows.dpeReintegration("contract_delivery")).toBe(true);
    expect(operationWindows.dpeReintegration("free_agency_end")).toBe(false);
    expect(operationWindows.trades("team_option_deadline")).toBe(true);
    expect(operationWindows.trades("free_releases_start")).toBe(false);
    expect(operationWindows.trades("auction_completed")).toBe(true);
    expect(operationWindows.trades("trade_deadline")).toBe(false);
  });

  it("propone la fine stagione come ultimo passaggio non persistito", () => {
    expect(nextLeagueTransition("free_agency_end")).toBe("season_end");
  });
});
