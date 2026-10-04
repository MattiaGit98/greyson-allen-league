import { describe, expect, it } from "vitest";
import {
  auctionContractAtPurchase,
  allowedPostAuctionContracts,
  auctionDestinationErrors,
  acquisitionKindForOutcome,
  qualifyingAuctionErrors,
  isPostAuctionContractAssignmentCandidate,
  legalAuctionContextualDestinations,
} from "./auction-management";

describe("pannello asta", () => {
  it("assegna subito l'annuale alla Q.O. accettata e lascia pendenti gli altri acquisti", () => {
    expect(auctionContractAtPurchase({ price: 8, currentSeasonEndYear: 2027 })).toMatchObject({
      cost: 8,
      contract: "PENDING",
      auctionPrice: 8,
    });
    expect(auctionContractAtPurchase({
      price: 7,
      acquisition: "qualifying_offer",
      currentSeasonEndYear: 2027,
    })).toMatchObject({ cost: 7, contract: "27", auctionPrice: 7, originalContractYears: 1 });
    expect(auctionContractAtPurchase({
      price: 1,
      acquisition: "qualifying_offer",
      currentSeasonEndYear: 2027,
    })).toMatchObject({ cost: 1, contract: "27 (Q)", auctionPrice: 1, originalContractYears: 1 });
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
    expect(isPostAuctionContractAssignmentCandidate({
      contract: "27",
      auctionPrice: 7,
      contractStartSeason: "2026/27",
      auctionAcquisition: "qualifying_offer",
    }, "2026/27")).toBe(false);
    expect(isPostAuctionContractAssignmentCandidate({
      contract: "PENDING",
      auctionPrice: 8,
      contractStartSeason: "2026/27",
      auctionAcquisition: "restricted_free_agent",
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

  it("propone in asta soltanto gli spostamenti contestuali consentiti", () => {
    expect(legalAuctionContextualDestinations({
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

    expect(legalAuctionContextualDestinations({
      entry: { slot: "two_way", contract: "28", cost: 8 },
      rookie: false,
      under23: false,
      seasonName: "2026/27",
      moment: "auction_start",
    })).toEqual(["regular"]);

    expect(legalAuctionContextualDestinations({
      entry: { slot: "regular", contract: "28", cost: 8 },
      rookie: false,
      under23: false,
      seasonName: "2026/27",
      moment: "auction_start",
    })).toEqual([]);

    expect(legalAuctionContextualDestinations({
      entry: {
        slot: "two_way",
        contract: "PENDING",
        cost: 3,
        auctionPrice: 3,
        contractStartSeason: "2026/27",
      },
      rookie: true,
      under23: false,
      seasonName: "2026/27",
      moment: "auction_start",
    })).toEqual(["regular", "g_league"]);

    expect(legalAuctionContextualDestinations({
      entry: {
        slot: "two_way",
        contract: "PENDING",
        cost: 3,
        auctionPrice: 3,
        contractStartSeason: "2026/27",
      },
      rookie: true,
      under23: false,
      seasonName: "2026/27",
      moment: "contract_delivery",
    })).toEqual(["regular"]);

    expect(legalAuctionContextualDestinations({
      entry: {
        slot: "regular",
        contract: "PENDING",
        cost: 3,
        auctionPrice: 3,
        auctionAcquisition: "restricted_free_agent",
        contractStartSeason: "2026/27",
      },
      rookie: true,
      under23: false,
      seasonName: "2026/27",
      moment: "auction_start",
    })).toEqual([]);

    expect(legalAuctionContextualDestinations({
      entry: {
        slot: "regular",
        contract: "27 + T.O.",
        cost: 3,
        contractStartSeason: "2025/26",
      },
      rookie: true,
      under23: false,
      seasonName: "2026/27",
      moment: "auction_start",
    })).toEqual([]);
  });
});
