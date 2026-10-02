import { describe, expect, it } from "vitest";
import { assignedAuctionContract, discountedAuctionContract } from "./contracts";
import { validateCapOperation } from "./credits";
import { countRosterRoles, validateRoleMinimums, validateSlots } from "./roster";

describe("regole contratti", () => {
  it("arrotonda per eccesso biennale e triennale", () => {
    expect(discountedAuctionContract(101, 2).calculated.annualCost).toBe(96);
    expect(discountedAuctionContract(101, 3).calculated.annualCost).toBe(91);
  });
  it("marca come estendibile un triennale acquistato ad almeno 200 crediti", () => {
    expect(assignedAuctionContract(200, "triennial", 2027)).toMatchObject({
      cost: 180,
      contract: "29 (E)",
      auctionPrice: 200,
      originalContractYears: 3,
    });
    expect(assignedAuctionContract(199, "triennial", 2027).contract).toBe("29");
  });
  it("assegna la Q.O. all'annuale acquistato a 1 credito", () => {
    expect(assignedAuctionContract(1, "annual", 2027)).toMatchObject({
      cost: 1,
      contract: "27 (Q)",
      auctionPrice: 1,
      originalContractYears: 1,
    });
    expect(assignedAuctionContract(2, "annual", 2027).contract).toBe("27");
  });
});

describe("cap e roster", () => {
  it("oltre quota 1000 in offseason consente soltanto operazioni che non aumentano il cap", () => {
    expect(validateCapOperation(1010, 0, "offseason").valid).toBe(true);
    expect(validateCapOperation(1010, 1, "offseason").valid).toBe(false);
  });
  it("blocca un acquisto d'asta >1 oltre cap", () => expect(validateCapOperation(1000, 2, "auction").valid).toBe(false));
  it("consente acquisto da 1 oltre cap in asta", () => expect(validateCapOperation(1000, 1, "auction").valid).toBe(true));
  it("segnala anche l'operazione che porta il cap stagionale oltre 1100", () => expect(validateCapOperation(1095, 10, "regular_season").valid).toBe(false));
  it("dopo la riapertura consente una firma oltre 1 credito fra quota 1000 e 1100", () => expect(validateCapOperation(1000, 25, "regular_season", true, false).valid).toBe(true));
  it("dopo la riapertura continua a bloccare l'aumento oltre quota 1100", () => expect(validateCapOperation(1095, 10, "regular_season", true, false).valid).toBe(false));
  it("blocca slot duplicati e minimi in stagione", () => {
    expect(validateSlots({ regular: 16, twoWay: 0, gLeague: 0, dpe: 0 }).valid).toBe(false);
    expect(validateRoleMinimums({ G: 5, A: 4, C: 3 }, true).valid).toBe(false);
  });
  it("somma i ruoli di roster, Two-way e G-League ma esclude la DPE", () => {
    const players = [
      { role: "G", slot: "regular" },
      { role: "G", slot: "two_way" },
      { role: "A", slot: "g_league" },
      { role: "C", slot: "dpe" },
    ] as const;
    expect(countRosterRoles(players)).toEqual({ G: 2, A: 1, C: 0 });
    expect(countRosterRoles(players, true)).toEqual({ G: 2, A: 1, C: 1 });
  });
});
