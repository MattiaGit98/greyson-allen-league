import { describe, expect, it } from "vitest";
import { allowedStretchYears, applyContextualContractCut, canApplyStretchProvision, canStretchContextualCut, contextualStretchYears, isStretchUnavailable } from "./stretch-provision";

describe("stretch provision", () => {
  it.each(["regular", "two_way", "g_league", "dpe"] as const)("consente taglio e stretch in un unico risultato dallo slot %s", (slot) => {
    const entry = { name: "Giocatore", cost: 11, contract: "27", state: "active" as const, slot, teamCode: "AAA" };
    expect(contextualStretchYears(entry, 2027)).toEqual([2, 3]);
    expect(applyContextualContractCut(entry, 2027, "contract_delivery", 2))
      .toMatchObject({ state: "cut", slot: "regular", cost: 6, contract: "28", stretchProvisionApplied: true });
    expect(applyContextualContractCut(entry, 2027, "contract_delivery", 3))
      .toMatchObject({ state: "cut", slot: "regular", cost: 4, contract: "29", stretchProvisionApplied: true });
    expect(entry.state).toBe("active");
  });

  it("mantiene le esclusioni anche nel taglio ordinario con stretch immediata", () => {
    const entry = { name: "Giocatore", cost: 11, contract: "28", state: "active" as const, slot: "regular" as const, teamCode: "AAA" };
    expect(contextualStretchYears(entry, 2027)).toEqual([3]);
    for (const patch of [{ contract: "29" }, { buyoutApplied: true }, { stretchProvisionApplied: true }, { cost: 0 }]) {
      expect(contextualStretchYears({ ...entry, ...patch }, 2027)).toEqual([]);
      expect(() => applyContextualContractCut({ ...entry, ...patch }, 2027, "contract_delivery", 3)).toThrow(/non consentita/);
    }
  });
  it("permette il taglio contestuale di un pending, con rate arrotondate e blocco di una seconda stretch", () => {
    const entry = { name: "Pending", cost: 11, contract: "PENDING", state: "active" as const, slot: "regular" as const, teamCode: "AAA" };
    expect(canStretchContextualCut(entry, 2027)).toBe(true);
    const cut = applyContextualContractCut(entry, 2027, "auction_start", 3);
    expect(cut).toMatchObject({ state: "cut", cost: 4, contract: "29", originalContractYears: 1, stretchProvisionApplied: true });
    expect(canStretchContextualCut(cut, 2027)).toBe(false);
    expect(() => applyContextualContractCut({ ...entry, contract: "28" }, 2027, "auction_start", 2)).toThrow();
    expect(applyContextualContractCut({ ...entry, contract: "28" }, 2027, "auction_start", 3))
      .toMatchObject({ state: "cut", cost: 8, contract: "29", stretchProvisionApplied: true });
  });
  it("si può applicare una sola volta a un contratto tagliato", () => {
    expect(canApplyStretchProvision({ cost: 10, contract: "28", state: "cut", stretchProvisionApplied: false }, 2028)).toBe(true);
    expect(canApplyStretchProvision({ cost: 10, contract: "28", state: "cut", stretchProvisionApplied: true }, 2028)).toBe(false);
    expect(canApplyStretchProvision({ cost: 10, contract: "28", state: "cut", stretchProvisionApplied: false, buyoutApplied: true }, 2028)).toBe(false);
  });

  it("non si applica a un giocatore ancora attivo", () => {
    expect(canApplyStretchProvision({ cost: 10, contract: "28", state: "active", stretchProvisionApplied: false }, 2028)).toBe(false);
  });

  it("si apre dall'offseason precedente al penultimo anno e limita le rate", () => {
    const entry = { cost: 10, contract: "28", state: "cut" as const, stretchProvisionApplied: false };
    expect(canApplyStretchProvision(entry, 2026)).toBe(false);
    expect(allowedStretchYears(entry, 2027)).toEqual([3]);
    expect(canApplyStretchProvision(entry, 2027)).toBe(true);
    expect(allowedStretchYears(entry, 2028)).toEqual([2, 3]);
    expect(canApplyStretchProvision(entry, 2028)).toBe(true);
  });

  it("non si applica ai rilasci gratuiti registrati a costo zero", () => {
    expect(canApplyStretchProvision({ cost: 0, contract: "28", state: "cut", stretchProvisionApplied: false }, 2028)).toBe(false);
  });

  it("usa lo stesso segnale dopo stretch e buyout", () => {
    expect(isStretchUnavailable({ stretchProvisionApplied: true })).toBe(true);
    expect(isStretchUnavailable({ buyoutApplied: true })).toBe(true);
    expect(isStretchUnavailable({ stretchProvisionApplied: false, buyoutApplied: false })).toBe(false);
  });
});
