import { describe, expect, it } from "vitest";
import { evaluateAuctionPurchase } from "./auction";
import { discountedAuctionContract, evaluateExtension } from "./contracts";
import { validateCapOperation } from "./credits";
import { validateRoleMinimums, validateSlots } from "./roster";
import { evaluateTrade } from "./trades";
import { evaluateQualifyingOfferEligibility, evaluateQualifyingOfferExtension } from "./qualifying-offers";
import { canTeamReacquirePlayer, evaluateStandardCut } from "./releases";
import { validatePhaseTransition } from "./seasons";

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
  it("trasforma un taglio in dead cap senza liberare il costo", () => {
    const value = evaluateStandardCut({ contractCost: 25, yearsRemaining: 2 });
    expect(value.calculated.slotFreed).toBe(1);
    expect(value.calculated.deadCapPerSeason).toBe(25);
    expect(canTeamReacquirePlayer(true).valid).toBe(false);
  });
});

describe("qualifying offer e fasi", () => {
  it("riconosce una QO eleggibile da team option esercitata", () => {
    expect(evaluateQualifyingOfferEligibility({
      wasCutBeforeExpiry: false,
      teamOptionExercised: true,
      oneCreditAnnualAuctionContract: false,
      freeAgentSignedBeforeDeadline: false,
    }).valid).toBe(true);
  });
  it("consente di estendere la QO soltanto durante l'asta", () => {
    expect(evaluateQualifyingOfferExtension(10, "offseason").valid).toBe(false);
    expect(evaluateQualifyingOfferExtension(10, "auction").calculated.openingBid).toBe(10);
  });
  it("valida la sequenza offseason, asta, stagione", () => {
    expect(validatePhaseTransition("offseason", "auction").valid).toBe(true);
    expect(validatePhaseTransition("offseason", "regular_season").valid).toBe(false);
    expect(validatePhaseTransition("auction", "regular_season").valid).toBe(true);
  });
});
