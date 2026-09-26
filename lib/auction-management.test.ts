import { describe, expect, it } from "vitest";
import {
  auctionContractForSlot,
  allowedPostAuctionContracts,
  auctionDestinationErrors,
  acquisitionKindForOutcome,
  qualifyingAuctionErrors,
  isPostAuctionContractAssignmentCandidate,
  auctionSlotCapacityErrors,
  auctionSlotCountsAfterMove,
  legalAuctionPromotionDestinations,
} from "./auction-management";

describe("pannello asta", () => {
  it("lascia il contratto da assegnare in ogni slot dell'asta", () => {
    expect(auctionContractForSlot("regular")).toBe("PENDING");
    expect(auctionContractForSlot("two_way")).toBe("PENDING");
    expect(auctionContractForSlot("g_league")).toBe("PENDING");
    expect(auctionContractForSlot("regular", "qualifying_offer")).toBe("PENDING");
  });

  it("include nella consegna contratti gli acquisti dell'asta ancora da definire", () => {
    expect(isPostAuctionContractAssignmentCandidate({
      contract: "PENDING",
      auctionPrice: 5,
      contractStartSeason: "2026/27",
    }, "2026/27")).toBe(true);
    expect(isPostAuctionContractAssignmentCandidate({
      contract: "T.O.",
      auctionPrice: 5,
      contractStartSeason: "2025/26",
    }, "2026/27")).toBe(false);
    expect(isPostAuctionContractAssignmentCandidate({
      contract: "28 (E)",
      auctionPrice: 200,
      contractStartSeason: "2026/27",
    }, "2026/27")).toBe(true);
  });

  it("distingue asta normale, Q.O. accettata e restricted free agent", () => {
    expect(acquisitionKindForOutcome("normal")).toBeUndefined();
    expect(acquisitionKindForOutcome("qualifying_offer")).toBe("qualifying_offer");
    expect(acquisitionKindForOutcome("restricted_free_agent")).toBe("restricted_free_agent");
    expect(allowedPostAuctionContracts("qualifying_offer")).toEqual(["annual"]);
    expect(allowedPostAuctionContracts("restricted_free_agent")).toEqual(["annual", "biennial", "triennial"]);
  });

  it("blocca una Q.O. accettata con squadra o prezzo diversi e gli slot speciali per Q.O./RFA", () => {
    expect(qualifyingAuctionErrors({
      hasQualifyingRight: true,
      outcome: "qualifying_offer",
      rightTeamCode: "AAA",
      rightAmount: 7,
      teamCode: "BBB",
      price: 8,
      slot: "two_way",
    })).toHaveLength(3);
    expect(qualifyingAuctionErrors({
      hasQualifyingRight: true,
      outcome: "qualifying_offer",
      rightTeamCode: "AAA",
      rightAmount: 7,
      teamCode: "AAA",
      price: 7,
      slot: "regular",
    })).toEqual([]);
  });

  it("tratta l'asta normale come un acquisto comune anche in presenza di una Q.O.", () => {
    expect(qualifyingAuctionErrors({
      hasQualifyingRight: true,
      outcome: "normal",
      rightTeamCode: "AAA",
      rightAmount: 7,
      teamCode: "BBB",
      price: 8,
      slot: "two_way",
    })).toEqual([]);
  });

  it("richiede che l'offerta RFA superi la qualifying offer rifiutata", () => {
    const wrongHolder = qualifyingAuctionErrors({
      hasQualifyingRight: true,
      outcome: "restricted_free_agent",
      rightTeamCode: "AAA",
      rightAmount: 7,
      teamCode: "BBB",
      price: 7,
      slot: "regular",
    });
    expect(wrongHolder).toContain("L'offerta finale per un restricted free agent deve superare l'importo della Q.O. rifiutata.");
    expect(wrongHolder).toContain("L’acquisto tramite Q.O. o come restricted free agent spetta alla squadra che detiene il diritto.");
    expect(qualifyingAuctionErrors({
      hasQualifyingRight: true,
      outcome: "restricted_free_agent",
      rightTeamCode: "AAA",
      rightAmount: 7,
      teamCode: "AAA",
      price: 8,
      slot: "regular",
    })).toEqual([]);
  });

  it("applica i limiti degli slot speciali", () => {
    expect(auctionDestinationErrors({ slot: "two_way", price: 11, rookie: true, under23: true })).toHaveLength(1);
    expect(auctionDestinationErrors({ slot: "g_league", price: 6, rookie: true, under23: true })).toHaveLength(1);
    expect(auctionDestinationErrors({ slot: "g_league", price: 5, rookie: false, under23: false })).toHaveLength(1);
    expect(auctionDestinationErrors({ slot: "two_way", price: 10, rookie: false, under23: true })).toEqual([]);
    expect(auctionDestinationErrors({ slot: "two_way", price: 16, rookie: false, under23: true })).toHaveLength(2);
  });

  it("consente di liberare la destinazione con uno scambio contestuale", () => {
    const counts = { regular: 15, two_way: 2, g_league: 3 };
    const withoutExchange = auctionSlotCountsAfterMove({ counts, fromSlot: "two_way", toSlot: "g_league", hasExchange: false });
    const withExchange = auctionSlotCountsAfterMove({ counts, fromSlot: "two_way", toSlot: "g_league", hasExchange: true });

    expect(withoutExchange).toEqual({ regular: 15, two_way: 1, g_league: 4 });
    expect(auctionSlotCapacityErrors(withoutExchange)).toHaveLength(1);
    expect(withExchange).toEqual(counts);
    expect(auctionSlotCapacityErrors(withExchange)).toEqual([]);
  });

  it("propone in asta soltanto le promozioni consentite", () => {
    expect(legalAuctionPromotionDestinations({
      entry: {
        slot: "g_league",
        contract: "PENDING",
        cost: 5,
        auctionPrice: 5,
        contractStartSeason: "2026/27",
      },
      rookie: true,
      under23: false,
      seasonName: "2026/27",
      moment: "auction_start",
    })).toEqual(["regular", "two_way"]);

    expect(legalAuctionPromotionDestinations({
      entry: { slot: "two_way", contract: "28", cost: 8 },
      rookie: false,
      under23: false,
      seasonName: "2026/27",
      moment: "auction_start",
    })).toEqual(["regular"]);

    expect(legalAuctionPromotionDestinations({
      entry: { slot: "regular", contract: "28", cost: 8 },
      rookie: false,
      under23: false,
      seasonName: "2026/27",
      moment: "auction_start",
    })).toEqual([]);
  });
});
