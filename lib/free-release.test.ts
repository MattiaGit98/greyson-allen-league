import { describe, expect, it } from "vitest";
import { availableFreeReleaseReasons, freeReleaseReasonAvailability } from "./free-release";

const ordinary = { cost: 20, contract: "28" };

describe("causali del rilascio gratuito", () => {
  it("apre le causali generali alla scadenza delle T.O.", () => {
    expect(availableFreeReleaseReasons("offseason_start", ordinary)).toEqual(["under_half_games"]);
    expect(availableFreeReleaseReasons("team_option_deadline", ordinary)).toEqual([
      "no_nba_roster",
      "suspension_or_legal",
      "under_half_games",
    ]);
  });

  it("chiude le causali alle rispettive scadenze", () => {
    expect(freeReleaseReasonAvailability("under_half_games", "auction_start", ordinary).available).toBe(false);
    expect(freeReleaseReasonAvailability("suspension_or_legal", "trade_deadline", ordinary).available).toBe(false);
    expect(freeReleaseReasonAvailability("no_nba_roster", "free_agency_end", ordinary).available).toBe(false);
  });

  it("limita la causale non garantita alle T.O. da 1 credito dalla relativa scadenza", () => {
    expect(freeReleaseReasonAvailability("one_credit_team_option", "offseason_start", { cost: 1, contract: "T.O." }).available).toBe(false);
    expect(freeReleaseReasonAvailability("one_credit_team_option", "team_option_deadline", { cost: 1, contract: "T.O." }).available).toBe(true);
    expect(freeReleaseReasonAvailability("one_credit_team_option", "auction_completed", { cost: 1, contract: "T.O." }).available).toBe(true);
    expect(freeReleaseReasonAvailability("one_credit_team_option", "contract_delivery", { cost: 1, contract: "T.O." }).available).toBe(false);
    expect(freeReleaseReasonAvailability("one_credit_team_option", "auction_completed", { cost: 2, contract: "T.O." }).available).toBe(false);
  });
});
