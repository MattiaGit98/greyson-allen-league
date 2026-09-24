import { describe, expect, it } from "vitest";
import { automaticFreeAgentContract, evaluateFreeAgentSigning } from "./free-agent";

const baseInput = {
  phase: "regular_season",
  currentCost: 900,
  price: 25,
  destination: "regular" as const,
  slots: { regular: 15, twoWay: 0, gLeague: 0, dpe: 0 },
  playerSelected: true,
  playerAlreadyOwned: false,
  qualifyingOfferActive: false,
  roles: { G: 5, A: 5, C: 5 },
  playerRole: "G" as const,
  cutRole: null,
  cutSlot: null,
};

describe("evaluateFreeAgentSigning", () => {
  it("assigns the annual contract with Q.O. only through the trade deadline", () => {
    expect(automaticFreeAgentContract("2026/27", false)).toBe("27 (Q)");
    expect(automaticFreeAgentContract("2026/27", true)).toBe("27");
  });

  it("requires a regular roster cut when all 15 places are occupied", () => {
    const result = evaluateFreeAgentSigning(baseInput);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === "SLOT_REGULAR_FULL")).toBe(true);
    expect(result.calculated.slotsAfter.regular).toBe(16);
  });

  it("keeps the roster at 15 and does not recover cap space from the cut", () => {
    const result = evaluateFreeAgentSigning({
      ...baseInput,
      cutRole: "A",
      cutSlot: "regular",
    });

    expect(result.valid).toBe(true);
    expect(result.calculated.slotsAfter.regular).toBe(15);
    expect(result.calculated.spaceBefore).toBe(100);
    expect(result.calculated.spaceAfter).toBe(75);
    expect(result.calculated.rolesAfter).toEqual({ G: 6, A: 4, C: 5 });
  });

  it("subtracts the role of a cut G-League player without changing regular slots", () => {
    const result = evaluateFreeAgentSigning({
      ...baseInput,
      slots: { regular: 14, twoWay: 0, gLeague: 1, dpe: 0 },
      cutRole: "C",
      cutSlot: "g_league",
    });

    expect(result.calculated.slotsAfter).toEqual({ regular: 15, twoWay: 0, gLeague: 0, dpe: 0 });
    expect(result.calculated.rolesAfter).toEqual({ G: 6, A: 5, C: 4 });
  });

  it("can assign a free agent costing at most 10 credits to a two-way slot", () => {
    const result = evaluateFreeAgentSigning({
      ...baseInput,
      price: 10,
      destination: "two_way",
      slots: { regular: 15, twoWay: 1, gLeague: 0, dpe: 0 },
    });

    expect(result.valid).toBe(true);
    expect(result.calculated.slotsAfter).toEqual({ regular: 15, twoWay: 2, gLeague: 0, dpe: 0 });
    expect(result.calculated.rolesAfter).toEqual({ G: 6, A: 5, C: 5 });
  });

  it("can promote a Two-way player contextually to make room for a free agent", () => {
    const result = evaluateFreeAgentSigning({
      ...baseInput,
      price: 10,
      destination: "two_way",
      slots: { regular: 14, twoWay: 2, gLeague: 0, dpe: 0 },
      promotionSourceSlot: "two_way",
      promotionDestinationSlot: "regular",
    });

    expect(result.valid).toBe(true);
    expect(result.calculated.slotsAfter).toEqual({ regular: 15, twoWay: 2, gLeague: 0, dpe: 0 });
  });

  it("rejects a two-way assignment above 10 credits", () => {
    const result = evaluateFreeAgentSigning({
      ...baseInput,
      destination: "two_way",
      slots: { regular: 14, twoWay: 0, gLeague: 0, dpe: 0 },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === "TWO_WAY_PRICE_LIMIT")).toBe(true);
  });

  it("non applica i minimi di ruolo quando la relativa finestra è terminata", () => {
    const result = evaluateFreeAgentSigning({
      ...baseInput,
      enforceRoleMinimums: false,
      roles: { G: 4, A: 5, C: 3 },
      slots: { regular: 12, twoWay: 0, gLeague: 0, dpe: 0 },
      playerRole: "A",
    });

    expect(result.warnings.some((warning) => warning.code.startsWith("ROLE_"))).toBe(false);
  });

});
