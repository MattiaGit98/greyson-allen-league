import { describe, expect, it } from "vitest";
import { evaluateAuctionPurchase } from "./auction";
import { discountedAuctionContract, evaluateExtension } from "./contracts";
import { validateCapOperation } from "./credits";
import { validateRoleMinimums, validateSlots } from "./roster";
import { evaluateTrade } from "./trades";

describe("regole contratti", () => {
  it("arrotonda per eccesso biennale e triennale", () => {
    expect(discountedAuctionContract(101, 2).calculated.annualCost).toBe(96);
    expect(discountedAuctionContract(101, 3).calculated.annualCost).toBe(91);
  });
  it("applica il 25% all'estensione eleggibile", () => {
    const value = evaluateExtension({ currentCost: 201, auctionCost: 220, originalYears: 3, yearsRemaining: 1, extendedLastSeason: false, windowOpen: true });
    expect(value.valid).toBe(true);
    expect(value.calculated.newCost).toBe(252);
  });
});

describe("cap e roster", () => {
  it("blocca un acquisto d'asta >1 oltre cap", () => expect(validateCapOperation(1000, 2, "auction").valid).toBe(false));
  it("consente acquisto da 1 oltre cap in asta", () => expect(validateCapOperation(1000, 1, "auction").valid).toBe(true));
  it("blocca slot duplicati e minimi in stagione", () => {
    expect(validateSlots({ regular: 16, twoWay: 0, gLeague: 0, dpe: 0 }).valid).toBe(false);
    expect(validateRoleMinimums({ G: 5, A: 4, C: 3 }, true).valid).toBe(false);
  });
});

describe("operazioni", () => {
  it("impedisce di duplicare un giocatore", () => {
    const value = evaluateAuctionPurchase({ currentCost: 400, price: 10, slots: { regular: 10, twoWay: 0, gLeague: 0, dpe: 0 }, playerAlreadyOwned: true });
    expect(value.errors.some((e) => e.code === "PLAYER_ALREADY_OWNED")).toBe(true);
  });
  it("valida tutte le squadre di uno scambio", () => {
    const value = evaluateTrade([{ teamId: "A", ownsAllPlayers: false, creditsAfter: 50, slotsAfter: { regular: 10, twoWay: 0, gLeague: 0, dpe: 0 } }], true, false);
    expect(value.valid).toBe(false);
  });
});
