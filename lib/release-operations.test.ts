import { describe, expect, it } from "vitest";
import { applyFreeRelease, releaseCapSpaces, stretchCapSpaces } from "./release-operations";

describe("tagli e rilasci", () => {
  it("conserva il rilascio gratuito tra i tagliati a costo zero e con lo stesso contratto", () => {
    expect(applyFreeRelease({
      name: "Giocatore",
      cost: 17,
      contract: "29 (Q)",
      state: "active",
      slot: "g_league",
      teamCode: "AAA",
      buyoutApplied: true,
    })).toEqual({
      name: "Giocatore",
      cost: 0,
      contract: "29 (Q)",
      state: "cut",
      slot: "regular",
      teamCode: "AAA",
      buyoutApplied: true,
    });
  });

  it("fa rientrare sul cap corrente un contratto tagliato dalla DPE", () => {
    expect(releaseCapSpaces({
      kind: "cut",
      spacesBefore: [100, 100, 100],
      contractCharges: [20, 20, 0],
      currentDpeExemption: true,
    })).toEqual([80, 100, 100]);
  });

  it("sostituisce sul cap il raddoppio T.O. con la metÃ  garantita", () => {
    expect(releaseCapSpaces({
      kind: "cut",
      spacesBefore: [100, 100, 100],
      contractCharges: [10, 10, 0],
      cutContractCharges: [5, 5, 0],
      currentDpeExemption: false,
    })).toEqual([105, 105, 100]);
  });

  it("il rilascio gratuito elimina ogni addebito residuo", () => {
    expect(releaseCapSpaces({
      kind: "free_release",
      spacesBefore: [100, 100, 100],
      contractCharges: [20, 20, 0],
      currentDpeExemption: false,
    })).toEqual([120, 120, 100]);
  });

  it("il buyout concentra il residuo sul primo anno", () => {
    expect(releaseCapSpaces({
      kind: "buyout",
      spacesBefore: [100, 100, 100],
      contractCharges: [20, 20, 0],
      currentDpeExemption: false,
    })).toEqual([80, 120, 100]);
  });

  it("il buyout concentra soltanto la metÃ  garantita dell'ultimo anno ex T.O.", () => {
    expect(releaseCapSpaces({
      kind: "buyout",
      spacesBefore: [100, 100, 100],
      contractCharges: [5, 10, 0],
      buyoutContractCharges: [5, 5, 0],
      currentDpeExemption: false,
    })).toEqual([95, 110, 100]);
  });

  it("il buyout di un giocatore in DPE fa rientrare sul cap tutto il residuo", () => {
    expect(releaseCapSpaces({
      kind: "buyout",
      spacesBefore: [100, 100, 100],
      contractCharges: [20, 20, 0],
      currentDpeExemption: true,
    })).toEqual([60, 120, 100]);
  });
});

describe("stretch provision", () => {
  it("divide il residuo in due rate equivalenti", () => {
    expect(stretchCapSpaces([100, 100, 100], 10, 2)).toEqual({
      installment: 5,
      spacesAfter: [105, 95, 100],
    });
  });

  it("distribuisce il residuo in tre rate arrotondate per eccesso", () => {
    expect(stretchCapSpaces([100, 100, 100], 10, 3)).toEqual({
      installment: 4,
      spacesAfter: [106, 96, 96],
    });
  });
});
