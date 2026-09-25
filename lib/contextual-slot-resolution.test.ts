import { describe, expect, it } from "vitest";
import { resolveContextualSlots, type ContextualSlotPlayer } from "./contextual-slot-resolution";

const players: ContextualSlotPlayer[] = [
  { name: "Centro roster", slot: "regular", cuttable: true, promotionDestinations: [] },
  { name: "Two-way", slot: "two_way", cuttable: true, promotionDestinations: ["regular"] },
  { name: "G-League", slot: "g_league", cuttable: true, promotionDestinations: ["two_way", "regular"] },
];

describe("risoluzione contestuale degli slot", () => {
  it("non permette operazioni quando lo slot di arrivo ha spazio", () => {
    const result = resolveContextualSlots({
      counts: { regular: 10, two_way: 1, g_league: 1 },
      incomingSlot: "two_way",
      players,
      decisions: [{ kind: "cut", playerName: "Two-way", destinationSlot: "" }],
    });
    expect(result.complete).toBe(false);
    expect(result.errors).toContain("Sono state inserite operazioni contestuali non necessarie.");
  });

  it("consente un taglio soltanto dallo slot da liberare", () => {
    const result = resolveContextualSlots({
      counts: { regular: 15, two_way: 2, g_league: 3 },
      incomingSlot: "two_way",
      players,
      decisions: [{ kind: "cut", playerName: "Two-way", destinationSlot: "" }],
    });
    expect(result.complete).toBe(true);
    expect(result.operations).toEqual([{ kind: "cut", playerName: "Two-way", sourceSlot: "two_way" }]);
  });

  it("gestisce promozione e taglio a cascata", () => {
    const result = resolveContextualSlots({
      counts: { regular: 15, two_way: 2, g_league: 3 },
      incomingSlot: "two_way",
      players,
      decisions: [
        { kind: "promote", playerName: "Two-way", destinationSlot: "regular" },
        { kind: "cut", playerName: "Centro roster", destinationSlot: "" },
      ],
    });
    expect(result.complete).toBe(true);
    expect(result.countsAfter).toEqual({ regular: 15, two_way: 2, g_league: 3 });
    expect(result.operations).toEqual([
      { kind: "promote", playerName: "Two-way", sourceSlot: "two_way", destinationSlot: "regular" },
      { kind: "cut", playerName: "Centro roster", sourceSlot: "regular" },
    ]);
  });

  it("può propagare la liberazione dalla G-League fino al roster", () => {
    const result = resolveContextualSlots({
      counts: { regular: 15, two_way: 2, g_league: 3 },
      incomingSlot: "g_league",
      players,
      decisions: [
        { kind: "promote", playerName: "G-League", destinationSlot: "two_way" },
        { kind: "promote", playerName: "Two-way", destinationSlot: "regular" },
        { kind: "cut", playerName: "Centro roster", destinationSlot: "" },
      ],
    });
    expect(result.complete).toBe(true);
    expect(result.operations).toHaveLength(3);
  });
});
