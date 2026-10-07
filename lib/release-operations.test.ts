import { describe, expect, it } from "vitest";
import { applyFreeRelease, releaseCapSpaces, stretchCapSpaces } from "./release-operations";

describe("tagli e rilasci", () => {
  it("prolunga di un anno la T.O. playoff rilasciata, anche dopo il cambio di annata", () => {
    const entry = { name: "Playoff", cost: 1, contract: "T.O.", state: "active" as const, slot: "g_league" as const, teamCode: "AAA", playoffTeamOptionUsedSeason: "2026/27" };
    expect(applyFreeRelease(entry, 2028)).toMatchObject({ cost: 0, contract: "28", state: "cut", playoffTeamOptionUsedSeason: undefined });
  });
  it("conserva il rilascio gratuito tra i tagliati a costo zero eliminando le possibilità future", () => {
    const released = applyFreeRelease({
      name: "Giocatore",
      cost: 17,
      contract: "29 (Q)",
      state: "active",
      slot: "g_league",
      teamCode: "AAA",
      buyoutApplied: true,
      scheduledSeasonEndCut: "2026/27",
    }, 2027);
    expect(released).toMatchObject({
      name: "Giocatore",
      cost: 0,
      contract: "29",
      state: "cut",
      slot: "regular",
      teamCode: "AAA",
      buyoutApplied: true,
    });
    expect(released.scheduledSeasonEndCut).toBeUndefined();
  });

  it("trasforma un contratto da assegnare in annuale al rilascio", () => {
    const released = applyFreeRelease({
      name: "Pending",
      cost: 1,
      contract: "PENDING",
      state: "active",
      slot: "regular",
      teamCode: "AAA",
    }, 2027);
    expect(released).toMatchObject({ cost: 0, contract: "27", originalContractYears: 1, state: "cut" });
  });

  it("fa rientrare sul cap corrente un contratto tagliato dalla DPE", () => {
    expect(releaseCapSpaces({
      kind: "cut",
      spacesBefore: [100, 100, 100],
      contractCharges: [20, 20, 0],
      currentDpeExemption: true,
    })).toEqual([80, 100, 100]);
  });

  it("usa gli addebiti espliciti quando il taglio modifica il peso residuo", () => {
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

  it("il buyout usa gli addebiti espliciti quando il residuo è già stato rettificato", () => {
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
