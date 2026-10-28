import { describe, expect, it } from "vitest";
import { applyBuyout, buyoutCost, applyFreeRelease, rosterAfterFreeRelease, releaseCapSpaces, stretchCapSpaces } from "./release-operations";
import type { RosterEntry } from "./league-types";
import { allowedStretchYears } from "./stretch-provision";

describe("tagli e rilasci", () => {
  it("conserva tra i tagliati a costo zero anche chi viene rilasciato perché non è più in NBA", () => {
    const roster = [
      { name: "Fuori NBA", cost: 12, contract: "28", state: "active" as const, slot: "regular" as const, teamCode: "AAA" },
      { name: "Altro", cost: 5, contract: "27", state: "active" as const, slot: "regular" as const, teamCode: "AAA" },
    ];
    expect(rosterAfterFreeRelease(roster, 0, 2027)).toEqual([
      expect.objectContaining({ name: "Fuori NBA", state: "cut", cost: 0, contract: "28" }),
      roster[1],
    ]);
  });
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

  it("il buyout concentra il residuo scontato sul primo anno", () => {
    expect(releaseCapSpaces({
      kind: "buyout",
      spacesBefore: [100, 100, 100],
      contractCharges: [20, 20, 0],
      currentDpeExemption: false,
    })).toEqual([88, 120, 100]);
  });

  it("il buyout sconta gli addebiti effettivi anche quando differiscono tra le annate", () => {
    expect(releaseCapSpaces({
      kind: "buyout",
      spacesBefore: [100, 100, 100],
      contractCharges: [5, 10, 0],
      currentDpeExemption: false,
    })).toEqual([93, 110, 100]);
  });

  it("il buyout dalla DPE include anche l'anno esente nel residuo da scontare", () => {
    expect(releaseCapSpaces({
      kind: "buyout",
      spacesBefore: [100, 100, 100],
      contractCharges: [20, 20, 0],
      currentDpeExemption: true,
    })).toEqual([68, 120, 100]);
  });
});

describe("buyout scontato", () => {
  const entry: RosterEntry = {
    name: "Pluriennale", cost: 47, contract: "29 (E)", state: "active", slot: "regular", teamCode: "AAA",
  };

  it.each([
    [[47, 47, 0], 76],
    [[47, 47, 47], 113],
    [[3, 3, 0], 5],
    [[5, 5, 0], 8],
  ])("sconta il totale %j e arrotonda una sola volta a %i", (charges, expected) => {
    expect(buyoutCost(charges)).toBe(expected);
  });

  it.each([[-1, 5], [1.5, 5], [NaN, 5], [Infinity, 5], [Number.MAX_SAFE_INTEGER, 1]])("rifiuta addebiti non validi: %j", (...charges) => {
    expect(() => buyoutCost(charges)).toThrow("Costo residuo");
  });

  it("produce un annuale tagliato senza diritti futuri, non modificando l'originale", () => {
    const result = applyBuyout({ ...entry, scheduledSeasonEndCut: "2026/27" }, 2027, [47, 47, 47]);
    expect(result).toMatchObject({ cost: 113, contract: "27", state: "cut", slot: "regular", teamCode: "AAA", buyoutApplied: true });
    expect(result.scheduledSeasonEndCut).toBeUndefined();
    expect(allowedStretchYears(result, 2027)).toEqual([]);
    expect(entry).toMatchObject({ cost: 47, contract: "29 (E)", state: "active" });
  });

  it.each(["27", "27 (Q)", "27 + T.O.", "27 + R.E.", "PENDING", "T.O.", "R.E."])("non compra anni opzionali o bozze di %s", (contract) => {
    expect(() => applyBuyout({ ...entry, contract }, 2027, [47, 47, 0])).toThrow("più di una stagione");
  });

  it("rifiuta i tagliati e chi ha un solo addebito residuo", () => {
    expect(() => applyBuyout({ ...entry, state: "cut" }, 2027, [47, 47, 47])).toThrow();
    expect(() => applyBuyout(entry, 2027, [47, 0, 0])).toThrow();
  });
});

describe("stretch provision", () => {
  it("divide il residuo in due rate equivalenti", () => {
    expect(stretchCapSpaces([100, 100, 100], [10, 0, 0], 2)).toEqual({
      installment: 5,
      spacesAfter: [105, 95, 100],
    });
  });

  it("distribuisce il residuo in tre rate arrotondate per eccesso", () => {
    expect(stretchCapSpaces([100, 100, 100], [10, 0, 0], 3)).toEqual({
      installment: 4,
      spacesAfter: [106, 96, 96],
    });
  });

  it("distribuisce il costo di due stagioni residue in tre rate", () => {
    expect(stretchCapSpaces([100, 100, 100], [11, 11, 0], 3)).toEqual({
      installment: 8,
      spacesAfter: [103, 103, 92],
    });
  });
});
