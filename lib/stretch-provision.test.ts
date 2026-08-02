import { describe, expect, it } from "vitest";
import { canApplyStretchProvision, isStretchUnavailable } from "./stretch-provision";

describe("stretch provision", () => {
  it("si può applicare una sola volta a un contratto tagliato", () => {
    expect(canApplyStretchProvision({ contract: "28", state: "cut", stretchProvisionApplied: false }, 2028)).toBe(true);
    expect(canApplyStretchProvision({ contract: "28", state: "cut", stretchProvisionApplied: true }, 2028)).toBe(false);
    expect(canApplyStretchProvision({ contract: "28", state: "cut", stretchProvisionApplied: false, buyoutApplied: true }, 2028)).toBe(false);
  });

  it("non si applica a un giocatore ancora attivo", () => {
    expect(canApplyStretchProvision({ contract: "28", state: "active", stretchProvisionApplied: false }, 2028)).toBe(false);
  });

  it("si apre all'inizio dell'annata dell'ultimo anno e resta chiusa prima", () => {
    const entry = { contract: "28", state: "cut" as const, stretchProvisionApplied: false };
    expect(canApplyStretchProvision(entry, 2027)).toBe(false);
    expect(canApplyStretchProvision(entry, 2028)).toBe(true);
  });

  it("usa lo stesso segnale dopo stretch e buyout", () => {
    expect(isStretchUnavailable({ stretchProvisionApplied: true })).toBe(true);
    expect(isStretchUnavailable({ buyoutApplied: true })).toBe(true);
    expect(isStretchUnavailable({ stretchProvisionApplied: false, buyoutApplied: false })).toBe(false);
  });
});
