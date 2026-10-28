import { describe, expect, it } from "vitest";
import {
  leagueMomentFromSeason,
  macroPhaseForMoment,
  nextLeagueTransition,
  operationWindows,
  publicPhaseLabel,
} from "./league-moments";

describe("momenti della lega", () => {
  it("usa esclusivamente il momento corrente salvato", () => {
    expect(leagueMomentFromSeason({ timeline_moment: "offseason_start" })).toBe("offseason_start");
    expect(() => leagueMomentFromSeason({})).toThrow("Momento della lega non valido");
  });

  it("passa alla stagione al termine dell'asta", () => {
    expect(macroPhaseForMoment("auction_start")).toBe("offseason");
    expect(macroPhaseForMoment("auction_completed")).toBe("regular_season");
  });

  it("apre e chiude le finestre operative", () => {
    expect(operationWindows.teamOption("offseason_start")).toBe(true);
    expect(operationWindows.teamOption("team_option_deadline")).toBe(false);
    expect(operationWindows.freeAgency("auction_start")).toBe(false);
    expect(operationWindows.freeAgency("auction_completed")).toBe(false);
    expect(operationWindows.freeAgency("contract_delivery")).toBe(true);
    expect(operationWindows.freeAgency("trade_deadline")).toBe(true);
    expect(operationWindows.freeAgency("buyout_end")).toBe(true);
    expect(operationWindows.freeAgency("free_agency_end")).toBe(false);
    expect(operationWindows.freeAgency("free_agency_reopening")).toBe(true);
    expect(operationWindows.trades("free_agency_reopening")).toBe(false);
    expect(operationWindows.extensions("free_agency_reopening")).toBe(false);
    expect(operationWindows.dpeActivation("free_agency_reopening")).toBe(false);
    expect(operationWindows.dpeReintegration("free_agency_reopening")).toBe(false);
    expect(operationWindows.freeRelease("offseason_start")).toBe(true);
    expect(operationWindows.freeRelease("free_agency_end")).toBe(false);
    expect(operationWindows.buyout("offseason_start")).toBe(false);
    expect(operationWindows.buyout("team_option_deadline")).toBe(false);
    expect(operationWindows.buyout("auction_start")).toBe(false);
    expect(operationWindows.buyout("auction_completed")).toBe(true);
    expect(operationWindows.buyout("contract_delivery")).toBe(true);
    expect(operationWindows.buyout("trade_deadline")).toBe(true);
    expect(operationWindows.buyout("buyout_end")).toBe(false);
    expect(operationWindows.buyout("free_agency_reopening")).toBe(false);
    expect(operationWindows.dpeActivation("offseason_start")).toBe(true);
    expect(operationWindows.dpeActivation("team_option_deadline")).toBe(true);
    expect(operationWindows.draft("team_option_deadline")).toBe(true);
    expect(operationWindows.draft("auction_start")).toBe(false);
    expect(operationWindows.auction("team_option_deadline")).toBe(false);
    expect(operationWindows.auction("auction_start")).toBe(true);
    expect(operationWindows.auction("auction_completed")).toBe(false);
    expect(operationWindows.extensions("team_option_deadline")).toBe(true);
    expect(operationWindows.extensions("auction_start")).toBe(false);
    expect(operationWindows.extensions("auction_completed")).toBe(false);
    expect(operationWindows.extensions("trade_deadline")).toBe(false);
    expect(operationWindows.extensions("buyout_end")).toBe(false);
    expect(operationWindows.dpeActivation("auction_start")).toBe(false);
    expect(operationWindows.dpeActivation("auction_completed")).toBe(true);
    expect(operationWindows.dpeActivation("trade_deadline")).toBe(false);
    expect(operationWindows.dpeReintegration("offseason_start")).toBe(false);
    expect(operationWindows.dpeReintegration("team_option_deadline")).toBe(false);
    expect(operationWindows.dpeReintegration("auction_start")).toBe(false);
    expect(operationWindows.dpeReintegration("auction_completed")).toBe(true);
    expect(operationWindows.dpeReintegration("contract_delivery")).toBe(true);
    expect(operationWindows.dpeReintegration("trade_deadline")).toBe(true);
    expect(operationWindows.dpeReintegration("buyout_end")).toBe(true);
    expect(operationWindows.dpeReintegration("free_agency_end")).toBe(false);
    expect(operationWindows.trades("team_option_deadline")).toBe(true);
    expect(operationWindows.trades("auction_start")).toBe(false);
    expect(operationWindows.trades("auction_completed")).toBe(true);
    expect(operationWindows.trades("trade_deadline")).toBe(false);
  });

  it("riapre la free agency prima di proporre la fine stagione", () => {
    expect(nextLeagueTransition("free_agency_end")).toBe("free_agency_reopening");
    expect(nextLeagueTransition("free_agency_reopening")).toBe("season_end");
  });

  it("passa pubblicamente alla postseason alla relativa data, senza creare una nuova fase", () => {
    expect(publicPhaseLabel("free_agency_end", "2027-05-20", "2027-05-19")).toBe("Regular season");
    expect(publicPhaseLabel("free_agency_end", "2027-05-20", "2027-05-20")).toBe("Postseason");
    expect(publicPhaseLabel("free_agency_reopening", "2027-05-20", "2027-05-25")).toBe("Postseason");
  });
});
