import { describe, expect, it } from "vitest";
import { contractIncludesTeamOption, isSecondContractYear, legalPromotionDestinations, legalSlotDestinations, moveRosterEntryToSlot, slotEligibility, slotEligibilityErrors, slotMoveTimingErrors } from "./slot-eligibility";

describe("idoneità Two-way e G-League", () => {
  it("riconosce sia una T.O. iniziale sia una già esercitata", () => {
    expect(contractIncludesTeamOption({ contract: "T.O." })).toBe(true);
    expect(contractIncludesTeamOption({ contract: "27 + R.E." })).toBe(true);
    expect(contractIncludesTeamOption({ contract: "28 (Q)", teamOptionFinalYear: 2028 })).toBe(true);
    expect(contractIncludesTeamOption({ contract: "28 (Q)" })).toBe(false);
  });

  it("ammette in G-League soltanto una T.O. fino a 5 crediti", () => {
    expect(slotEligibility({ contract: "T.O.", cost: 5 }, "2026/27").g_league).toBe(true);
    expect(slotEligibility({ contract: "T.O.", cost: 6 }, "2026/27").g_league).toBe(false);
    expect(slotEligibility({ contract: "27", cost: 5, freeAgentSignedSeason: "2026/27" }, "2026/27").g_league).toBe(false);
  });

  it("espone per una promozione soltanto gli slot superiori consentiti", () => {
    expect(legalPromotionDestinations({ contract: "T.O.", cost: 5, slot: "g_league" }, "2026/27", "team_option_deadline"))
      .toEqual(["regular", "two_way"]);
    expect(legalPromotionDestinations({ contract: "T.O.", cost: 5, slot: "two_way" }, "2026/27", "team_option_deadline"))
      .toEqual(["regular"]);
  });

  it("ammette nei Two-way tutte e tre le categorie fino a 10 crediti", () => {
    expect(slotEligibility({ contract: "T.O.", cost: 10 }, "2026/27").two_way).toBe(true);
    expect(slotEligibility({ contract: "27", cost: 10, freeAgentSignedSeason: "2026/27" }, "2026/27").two_way).toBe(true);
    expect(slotEligibility({ contract: "28", cost: 10, endedPreviousSeasonInGLeague: true }, "2026/27").two_way).toBe(true);
    expect(slotEligibility({ contract: "27", cost: 11, freeAgentSignedSeason: "2026/27" }, "2026/27").two_way).toBe(false);
  });

  it("fa scadere l'idoneità legata alla firma da free agent con il cambio di annata", () => {
    const entry = { contract: "28", cost: 8, freeAgentSignedSeason: "2026/27" };
    expect(slotEligibility(entry, "2026/27").two_way).toBe(true);
    expect(slotEligibility(entry, "2027/28").two_way).toBe(false);
    expect(slotEligibilityErrors(entry, "two_way", "2027/28")).toHaveLength(1);
  });

  it("apre le retrocessioni soltanto dal Draft alla consegna e lascia sempre aperte le promozioni", () => {
    const entry = { contract: "T.O.", cost: 5, slot: "regular" as const, contractStartSeason: "2026/27" };
    expect(slotMoveTimingErrors(entry, "two_way", "2026/27", "offseason_start")).toHaveLength(1);
    expect(slotMoveTimingErrors(entry, "two_way", "2026/27", "team_option_deadline")).toEqual([]);
    expect(slotMoveTimingErrors(entry, "two_way", "2026/27", "auction_completed")).toEqual([]);
    expect(slotMoveTimingErrors(entry, "two_way", "2026/27", "contract_delivery")).toHaveLength(1);
    expect(slotMoveTimingErrors({ ...entry, slot: "g_league" }, "regular", "2026/27", "contract_delivery")).toEqual([]);
  });

  it("nega la finestra eccezionale al secondo anno e dopo una promozione obbligatoria", () => {
    const secondYear = { contract: "27 + R.E.", cost: 5, slot: "regular" as const, contractStartSeason: "2025/26" };
    expect(isSecondContractYear(secondYear, "2026/27")).toBe(true);
    expect(slotMoveTimingErrors(secondYear, "two_way", "2026/27", "team_option_deadline")).toHaveLength(1);
    expect(slotMoveTimingErrors(
      { ...secondYear, contractStartSeason: "2024/25", twoWayPromotionLocked: true },
      "two_way",
      "2026/27",
      "team_option_deadline",
    )).toHaveLength(1);
  });

  it("dopo la consegna concede soltanto le promozioni previste", () => {
    const regular = { contract: "T.O.", cost: 5, slot: "regular" as const, contractStartSeason: "2026/27" };
    const twoWay = { contract: "T.O.", cost: 5, slot: "two_way" as const, contractStartSeason: "2026/27" };
    const gLeague = { contract: "T.O.", cost: 5, slot: "g_league" as const, contractStartSeason: "2026/27" };
    expect(legalSlotDestinations(regular, "2026/27", "contract_delivery")).toEqual(["regular"]);
    expect(legalSlotDestinations(twoWay, "2026/27", "contract_delivery")).toEqual(["regular", "two_way"]);
    expect(legalSlotDestinations(gLeague, "2026/27", "contract_delivery")).toEqual(["regular", "two_way", "g_league"]);
  });

  it("impone ai free agent di scegliere il Two-way direttamente al momento della firma", () => {
    const freeAgent = {
      contract: "27 (Q)",
      cost: 10,
      slot: "regular" as const,
      freeAgentSignedSeason: "2026/27",
      contractStartSeason: "2026/27",
    };

    expect(legalSlotDestinations(freeAgent, "2026/27", "contract_delivery")).toEqual(["regular"]);
    expect(legalSlotDestinations({ ...freeAgent, slot: "two_way" as const }, "2026/27", "contract_delivery"))
      .toEqual(["regular", "two_way"]);
  });

  it("dall'inizio del Draft consente i ripensamenti soltanto se il giocatore è idoneo e al primo anno", () => {
    expect(legalSlotDestinations(
      { contract: "T.O.", cost: 5, slot: "regular", contractStartSeason: "2026/27" },
      "2026/27",
      "auction_completed",
    )).toEqual(["regular", "two_way", "g_league"]);
    expect(legalSlotDestinations(
      { contract: "27", cost: 5, slot: "regular", contractStartSeason: "2026/27" },
      "2026/27",
      "auction_completed",
    )).toEqual(["regular"]);
  });

  it("consente gli slot speciali a un contratto da assegnare solo con futura T.O. e soglie valide", () => {
    const pending = {
      contract: "PENDING",
      cost: 5,
      auctionPrice: 5,
      slot: "regular" as const,
      contractStartSeason: "2026/27",
    };

    expect(legalSlotDestinations({ ...pending, rookie: true }, "2026/27", "auction_completed"))
      .toEqual(["regular", "two_way", "g_league"]);
    expect(legalSlotDestinations({ ...pending, under23: true, cost: 16, auctionPrice: 16 }, "2026/27", "auction_completed"))
      .toEqual(["regular"]);
    expect(legalSlotDestinations({ ...pending, rookie: true, auctionAcquisition: "restricted_free_agent" }, "2026/27", "auction_completed"))
      .toEqual(["regular"]);
  });

  it("lo spostamento non modifica contratto, costo o provenienza", () => {
    const entry = {
      name: "Giocatore",
      contract: "27 + R.E.",
      cost: 5,
      slot: "g_league" as const,
      state: "active" as const,
      teamCode: "AAA",
    };
    expect(moveRosterEntryToSlot(entry, "two_way")).toEqual({ ...entry, slot: "two_way" });
  });
});
