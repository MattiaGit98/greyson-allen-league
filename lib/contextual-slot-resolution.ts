export type ContextualSlot = "regular" | "two_way" | "g_league";

export type ContextualSlotCounts = Record<ContextualSlot, number>;

export type ContextualSlotPlayer = {
  name: string;
  slot: ContextualSlot;
  cuttable: boolean;
  stretchOptions?: (2 | 3)[];
  freeReleasable?: boolean;
  moveDestinations: ContextualSlot[];
};

export type ContextualSlotDecision = {
  kind: "cut" | "free_release" | "move" | "";
  playerName: string;
  destinationSlot: ContextualSlot | "";
  stretchYears?: 2 | 3 | null;
};

export type AppliedContextualSlotOperation =
  | { kind: "cut"; playerName: string; sourceSlot: ContextualSlot; stretchYears: 2 | 3 | null }
  | { kind: "free_release"; playerName: string; sourceSlot: ContextualSlot }
  | { kind: "move"; playerName: string; sourceSlot: ContextualSlot; destinationSlot: ContextualSlot };

export type ContextualSlotResolutionStep = {
  slot: ContextualSlot;
  decision: ContextualSlotDecision;
  cutCandidates: ContextualSlotPlayer[];
  freeReleaseCandidates: ContextualSlotPlayer[];
  moveCandidates: ContextualSlotPlayer[];
};

export const contextualSlotLimits: ContextualSlotCounts = {
  regular: 15,
  two_way: 2,
  g_league: 3,
};

export function resolveContextualSlots({
  counts,
  incomingSlot,
  players,
  decisions,
}: {
  counts: ContextualSlotCounts;
  incomingSlot: ContextualSlot;
  players: ContextualSlotPlayer[];
  decisions: ContextualSlotDecision[];
}) {
  const countsAfter = { ...counts, [incomingSlot]: counts[incomingSlot] + 1 };
  const currentSlots = new Map(players.map((player) => [player.name, player.slot]));
  const usedPlayers = new Set<string>();
  const operations: AppliedContextualSlotOperation[] = [];
  const steps: ContextualSlotResolutionStep[] = [];
  const errors: string[] = [];

  for (let index = 0; index <= decisions.length; index += 1) {
    const overflowingSlots = contextualSlotOrder.filter((slot) => countsAfter[slot] > contextualSlotLimits[slot]);
    if (!overflowingSlots.length) {
      if (decisions.length > index) errors.push("Sono state inserite operazioni contestuali non necessarie.");
      return { complete: errors.length === 0, countsAfter, operations, steps, errors };
    }
    if (overflowingSlots.length > 1) {
      errors.push("La sequenza crea più slot sovraffollati contemporaneamente.");
      return { complete: false, countsAfter, operations, steps, errors };
    }

    const slot = overflowingSlots[0]!;
    const availablePlayers = players.filter((player) => currentSlots.get(player.name) === slot && !usedPlayers.has(player.name));
    const cutCandidates = availablePlayers.filter((player) => player.cuttable);
    const freeReleaseCandidates = availablePlayers.filter((player) => player.freeReleasable);
    const moveCandidates = availablePlayers.filter((player) => player.moveDestinations.length > 0);
    const decision = decisions[index] ?? emptyContextualSlotDecision();
    steps.push({ slot, decision, cutCandidates, freeReleaseCandidates, moveCandidates });

    if (!cutCandidates.length && !freeReleaseCandidates.length && !moveCandidates.length) {
      errors.push(`Non ci sono operazioni consentite per liberare lo slot ${contextualSlotLabel(slot)}.`);
      return { complete: false, countsAfter, operations, steps, errors };
    }
    if (!decision.kind || !decision.playerName) {
      return { complete: false, countsAfter, operations, steps, errors };
    }

    const selectedPlayer = availablePlayers.find((player) => player.name === decision.playerName);
    if (!selectedPlayer) {
      errors.push(`Il giocatore scelto non appartiene più allo slot ${contextualSlotLabel(slot)}.`);
      return { complete: false, countsAfter, operations, steps, errors };
    }
    if (decision.kind === "cut") {
      if (!selectedPlayer.cuttable) {
        errors.push(`${selectedPlayer.name} non può essere tagliato in questa operazione.`);
        return { complete: false, countsAfter, operations, steps, errors };
      }
      const stretchOptions = selectedPlayer.stretchOptions ?? [];
      if (decision.stretchYears != null && !stretchOptions.includes(decision.stretchYears)) {
        errors.push(`${selectedPlayer.name} non è idoneo alla stretch provision contestuale.`);
        return { complete: false, countsAfter, operations, steps, errors };
      }
      countsAfter[slot] -= 1;
      usedPlayers.add(selectedPlayer.name);
      operations.push({ kind: "cut", playerName: selectedPlayer.name, sourceSlot: slot, stretchYears: decision.stretchYears ?? null });
      continue;
    }
    if (decision.kind === "free_release") {
      if (!selectedPlayer.freeReleasable) {
        errors.push(`${selectedPlayer.name} non può essere rilasciato gratuitamente in questa operazione.`);
        return { complete: false, countsAfter, operations, steps, errors };
      }
      countsAfter[slot] -= 1;
      usedPlayers.add(selectedPlayer.name);
      operations.push({ kind: "free_release", playerName: selectedPlayer.name, sourceSlot: slot });
      continue;
    }

    if (!decision.destinationSlot || !selectedPlayer.moveDestinations.includes(decision.destinationSlot)) {
      errors.push(`La destinazione dello spostamento di ${selectedPlayer.name} non è consentita.`);
      return { complete: false, countsAfter, operations, steps, errors };
    }
    countsAfter[slot] -= 1;
    countsAfter[decision.destinationSlot] += 1;
    currentSlots.set(selectedPlayer.name, decision.destinationSlot);
    usedPlayers.add(selectedPlayer.name);
    operations.push({
      kind: "move",
      playerName: selectedPlayer.name,
      sourceSlot: slot,
      destinationSlot: decision.destinationSlot,
    });
  }

  return { complete: false, countsAfter, operations, steps, errors };
}

export function emptyContextualSlotDecision(): ContextualSlotDecision {
  return { kind: "", playerName: "", destinationSlot: "", stretchYears: null };
}

export function parseContextualSlotDecisions(value: FormDataEntryValue | null) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value ?? "[]"));
  } catch {
    throw new Error("Operazioni contestuali non valide.");
  }
  if (!Array.isArray(parsed) || parsed.length > 3) throw new Error("Operazioni contestuali non valide.");
  return parsed.map((decision): ContextualSlotDecision => {
    if (!isRecord(decision)) throw new Error("Operazioni contestuali non valide.");
    const kind = decision.kind;
    const playerName = typeof decision.playerName === "string" ? decision.playerName.trim() : "";
    const destinationSlot = decision.destinationSlot;
    const stretchYears = decision.stretchYears == null ? null : decision.stretchYears;
    if (
      !["cut", "free_release", "move"].includes(String(kind))
      || !playerName
      || playerName.length > 120
      || (destinationSlot !== "" && !contextualSlotOrder.includes(destinationSlot as ContextualSlot))
      || ((kind === "cut" || kind === "free_release") && destinationSlot !== "")
      || (kind === "move" && destinationSlot === "")
      || (stretchYears !== null && (kind !== "cut" || (stretchYears !== 2 && stretchYears !== 3)))
    ) {
      throw new Error("Operazioni contestuali non valide.");
    }
    return { kind: kind as "cut" | "free_release" | "move", playerName, destinationSlot: destinationSlot as ContextualSlot | "", stretchYears };
  });
}

export function contextualSlotLabel(slot: ContextualSlot) {
  if (slot === "regular") return "Roster";
  if (slot === "two_way") return "Two-way";
  return "G-League";
}

const contextualSlotOrder: ContextualSlot[] = ["regular", "two_way", "g_league"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
