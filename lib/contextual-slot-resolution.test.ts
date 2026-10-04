import { describe, expect, it } from "vitest";
import { resolveContextualSlots, type ContextualSlotPlayer } from "./contextual-slot-resolution";

const players: ContextualSlotPlayer[] = [
  { name: "Centro roster", slot: "regular", cuttable: true, moveDestinations: [] },
  { name: "Two-way", slot: "two_way", cuttable: true, moveDestinations: ["regular", "g_league"] },
  { name: "G-League", slot: "g_league", cuttable: true, moveDestinations: ["two_way", "regular"] },
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

  it("consente il rilascio gratuito soltanto per un candidato idoneo", () => {
    const result = resolveContextualSlots({
      counts: { regular: 15, two_way: 2, g_league: 3 },
      incomingSlot: "two_way",
      players: players.map((player) => (
        player.name === "Two-way" ? { ...player, freeReleasable: true } : player
      )),
      decisions: [{ kind: "free_release", playerName: "Two-way", destinationSlot: "" }],
    });

    expect(result.complete).toBe(true);
    expect(result.operations).toEqual([{ kind: "free_release", playerName: "Two-way", sourceSlot: "two_way" }]);
  });

  it("rifiuta il rilascio gratuito di un giocatore non idoneo", () => {
    const result = resolveContextualSlots({
      counts: { regular: 15, two_way: 2, g_league: 3 },
      incomingSlot: "two_way",
      players,
      decisions: [{ kind: "free_release", playerName: "Two-way", destinationSlot: "" }],
    });

    expect(result.complete).toBe(false);
    expect(result.errors).toContain("Two-way non può essere rilasciato gratuitamente in questa operazione.");
  });

  it("gestisce spostamento e taglio a cascata", () => {
    const result = resolveContextualSlots({
      counts: { regular: 15, two_way: 2, g_league: 3 },
      incomingSlot: "two_way",
      players,
      decisions: [
        { kind: "move", playerName: "Two-way", destinationSlot: "regular" },
        { kind: "cut", playerName: "Centro roster", destinationSlot: "" },
      ],
    });
    expect(result.complete).toBe(true);
    expect(result.countsAfter).toEqual({ regular: 15, two_way: 2, g_league: 3 });
    expect(result.operations).toEqual([
      { kind: "move", playerName: "Two-way", sourceSlot: "two_way", destinationSlot: "regular" },
      { kind: "cut", playerName: "Centro roster", sourceSlot: "regular" },
    ]);
  });

  it("può propagare la liberazione dalla G-League fino al roster", () => {
    const result = resolveContextualSlots({
      counts: { regular: 15, two_way: 2, g_league: 3 },
      incomingSlot: "g_league",
      players,
      decisions: [
        { kind: "move", playerName: "G-League", destinationSlot: "two_way" },
        { kind: "move", playerName: "Two-way", destinationSlot: "regular" },
        { kind: "cut", playerName: "Centro roster", destinationSlot: "" },
      ],
    });
    expect(result.complete).toBe(true);
    expect(result.operations).toHaveLength(3);
  });

  it("gestisce la cascata dopo avere liberato lo slot di partenza di un giocatore", () => {
    const result = resolveContextualSlots({
      // Il giocatore principale è già stato sottratto dal roster prima di
      // aggiungerlo alla G-League, come avviene nel pannello asta.
      counts: { regular: 14, two_way: 2, g_league: 3 },
      incomingSlot: "g_league",
      players,
      decisions: [
        { kind: "move", playerName: "G-League", destinationSlot: "two_way" },
        { kind: "move", playerName: "Two-way", destinationSlot: "regular" },
      ],
    });

    expect(result.complete).toBe(true);
    expect(result.countsAfter).toEqual({ regular: 15, two_way: 2, g_league: 3 });
    expect(result.operations).toEqual([
      { kind: "move", playerName: "G-League", sourceSlot: "g_league", destinationSlot: "two_way" },
      { kind: "move", playerName: "Two-way", sourceSlot: "two_way", destinationSlot: "regular" },
    ]);
  });

  it("consente anche uno spostamento verso uno slot inferiore quando è tra le destinazioni ammesse", () => {
    const result = resolveContextualSlots({
      counts: { regular: 10, two_way: 2, g_league: 2 },
      incomingSlot: "two_way",
      players,
      decisions: [{ kind: "move", playerName: "Two-way", destinationSlot: "g_league" }],
    });

    expect(result.complete).toBe(true);
    expect(result.countsAfter).toEqual({ regular: 10, two_way: 2, g_league: 3 });
  });
});
