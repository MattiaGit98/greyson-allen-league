import { describe, expect, it } from "vitest";
import { availableFreeReleaseReasons, freeReleaseReasonAvailability, freeReleaseReasonLabels, isFreeReleaseReason } from "./free-release";

const ordinary = { cost: 20, contract: "28", state: "active" as const };
const cut = { ...ordinary, state: "cut" as const };
const seasonName = "2027/28";

describe("causali del rilascio gratuito", () => {
  it("apre le causali generali alla scadenza delle T.O.", () => {
    expect(availableFreeReleaseReasons("offseason_start", ordinary, seasonName)).toEqual(["under_half_games"]);
    expect(availableFreeReleaseReasons("team_option_deadline", ordinary, seasonName)).toEqual([
      "no_nba_roster",
      "under_half_games",
    ]);
  });

  it("chiude le causali alle rispettive scadenze", () => {
    expect(freeReleaseReasonAvailability("under_half_games", "auction_start", ordinary, seasonName).available).toBe(false);
    expect(freeReleaseReasonAvailability("no_nba_roster", "trade_deadline", ordinary, seasonName).available).toBe(true);
    expect(freeReleaseReasonAvailability("no_nba_roster", "buyout_end", ordinary, seasonName).available).toBe(true);
    expect(freeReleaseReasonAvailability("no_nba_roster", "free_agency_end", ordinary, seasonName).available).toBe(false);
  });

  it("non consente la causale delle partite ai giocatori già tagliati", () => {
    expect(freeReleaseReasonAvailability("under_half_games", "offseason_start", cut, seasonName)).toEqual({
      available: false,
      unavailableReason: "Questa causale è riservata ai giocatori non ancora tagliati.",
    });
    expect(availableFreeReleaseReasons("offseason_start", cut, seasonName)).toEqual([]);
    expect(availableFreeReleaseReasons("team_option_deadline", cut, seasonName)).toEqual([
      "no_nba_roster",
    ]);
  });

  it("non consente un secondo rilascio a un giocatore già registrato a costo zero", () => {
    const alreadyReleased = { ...cut, cost: 0 };
    expect(availableFreeReleaseReasons("team_option_deadline", alreadyReleased, seasonName)).toEqual([]);
    expect(freeReleaseReasonAvailability("no_nba_roster", "team_option_deadline", alreadyReleased, seasonName)).toEqual({
      available: false,
      unavailableReason: "Il giocatore è già stato rilasciato gratuitamente.",
    });
  });

  it("nasconde solo la causale delle partite dopo il reintegro DPE a fine stagione", () => {
    const formerDpe = { ...ordinary, dpeAppliedSeasons: ["2026/27"], dpeSeasonEndReintegratedSeasons: ["2026/27"] };
    expect(freeReleaseReasonAvailability("under_half_games", "offseason_start", formerDpe, seasonName).available).toBe(false);
    expect(availableFreeReleaseReasons("offseason_start", formerDpe, seasonName)).toEqual([]);
    expect(availableFreeReleaseReasons("team_option_deadline", formerDpe, seasonName)).toEqual([
      "no_nba_roster",
    ]);
    expect(availableFreeReleaseReasons("offseason_start", formerDpe, "2028/29")).toEqual(["under_half_games"]);
    expect(availableFreeReleaseReasons("offseason_start", {
      ...ordinary, dpeAppliedSeasons: ["2026/27", "2027/28"], dpeSeasonEndReintegratedSeasons: ["2027/28"],
    }, "2028/29")).toEqual([]);
    expect(availableFreeReleaseReasons("offseason_start", {
      ...ordinary, dpeAppliedSeasons: ["2027/28"],
    }, "2027/28")).toEqual(["under_half_games"]);
  });

  it("non esclude chi è stato reintegrato anticipatamente, anche dopo uno scambio", () => {
    const reintegratedEarly = { ...ordinary, dpeAppliedSeasons: ["2026/27"], teamCode: "BBB" };
    expect(availableFreeReleaseReasons("offseason_start", reintegratedEarly, seasonName)).toEqual(["under_half_games"]);
    expect(availableFreeReleaseReasons("auction_start", reintegratedEarly, seasonName)).toEqual([]);
  });

  it("richiede 15 giorni senza squadra NBA e non riapre questa causale con la March Madness", () => {
    expect(freeReleaseReasonLabels.no_nba_roster).toContain("almeno 15 giorni");
    expect(freeReleaseReasonAvailability("no_nba_roster", "offseason_start", ordinary, seasonName).available).toBe(false);
    expect(freeReleaseReasonAvailability("no_nba_roster", "auction_start", ordinary, seasonName).available).toBe(false);
    expect(freeReleaseReasonAvailability("no_nba_roster", "auction_completed", ordinary, seasonName).available).toBe(true);
    expect(freeReleaseReasonAvailability("no_nba_roster", "free_agency_reopening", ordinary, seasonName).available).toBe(false);
  });

  it("rifiuta la vecchia causale per squalifica o cause giudiziarie anche da un modulo rimasto aperto", () => {
    expect(isFreeReleaseReason("suspension_or_legal")).toBe(false);
    for (const moment of ["offseason_start", "team_option_deadline", "auction_start", "auction_completed", "trade_deadline", "buyout_end", "free_agency_end", "free_agency_reopening"] as const) {
      expect(freeReleaseReasonAvailability("suspension_or_legal", moment, ordinary, seasonName).available).toBe(false);
      expect(availableFreeReleaseReasons(moment, ordinary, seasonName)).not.toContain("suspension_or_legal");
    }
    expect(freeReleaseReasonAvailability("suspension_or_legal", "auction_completed", { cost: 1, contract: "27 + T.O.", state: "active" }, seasonName).available).toBe(false);
    expect(freeReleaseReasonAvailability("non prevista", "team_option_deadline", ordinary, seasonName).available).toBe(false);
  });

  it("limita la causale non garantita alle T.O. da 1 credito dalla relativa scadenza", () => {
    expect(freeReleaseReasonAvailability("one_credit_team_option", "offseason_start", { cost: 1, contract: "27 + T.O.", state: "active" }, seasonName).available).toBe(false);
    expect(freeReleaseReasonAvailability("one_credit_team_option", "team_option_deadline", { cost: 1, contract: "27 + T.O.", state: "active" }, seasonName).available).toBe(true);
    expect(freeReleaseReasonAvailability("one_credit_team_option", "auction_completed", { cost: 1, contract: "27 + T.O.", state: "active" }, seasonName).available).toBe(true);
    expect(freeReleaseReasonAvailability("one_credit_team_option", "contract_delivery", { cost: 1, contract: "27 + T.O.", state: "active" }, seasonName).available).toBe(false);
    expect(freeReleaseReasonAvailability("one_credit_team_option", "auction_completed", { cost: 2, contract: "27 + T.O.", state: "active" }, seasonName).available).toBe(false);
  });

  it("include i contratti da assegnare da 1 credito eleggibili per la T.O.", () => {
    const pending = { cost: 1, auctionPrice: 1, contract: "PENDING", state: "active" as const, contractStartSeason: seasonName };

    expect(freeReleaseReasonAvailability("one_credit_team_option", "auction_start", { ...pending, rookie: true }, seasonName).available).toBe(true);
    expect(freeReleaseReasonAvailability("one_credit_team_option", "auction_completed", { ...pending, under23: true }, seasonName).available).toBe(true);
    expect(freeReleaseReasonAvailability("one_credit_team_option", "auction_start", pending, seasonName).available).toBe(false);
    expect(freeReleaseReasonAvailability("one_credit_team_option", "auction_start", { ...pending, auctionAcquisition: "restricted_free_agent" }, seasonName).available).toBe(false);
    expect(freeReleaseReasonAvailability("one_credit_team_option", "auction_start", { ...pending, cost: 2, auctionPrice: 2, rookie: true }, seasonName).available).toBe(false);
  });
});
