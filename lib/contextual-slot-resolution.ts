export type ContextualSlot = "regular" | "two_way" | "g_league";

export type ContextualSlotCounts = Record<ContextualSlot, number>;

export type ContextualSlotPlayer = {
  name: string;
  slot: ContextualSlot;
  cuttable: boolean;
  promotionDestinations: ContextualSlot[];
};

export type ContextualSlotDecision = {
  kind: "cut" | "promote" | "";
  playerName: string;
  destinationSlot: ContextualSlot | "";
};

export type AppliedContextualSlotOperation =
  | { kind: "cut"; playerName: string; sourceSlot: ContextualSlot }
  | { kind: "promote"; playerName: string; sourceSlot: ContextualSlot; destinationSlot: ContextualSlot };

export type ContextualSlotResolutionStep = {
  slot: ContextualSlot;
  decision: ContextualSlotDecision;
  cutCandidates: ContextualSlotPlayer[];
  promotionCandidates: ContextualSlotPlayer[];
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
    const promotionCandidates = availablePlayers.filter((player) => player.promotionDestinations.length > 0);
    const decision = decisions[index] ?? emptyContextualSlotDecision();
    steps.push({ slot, decision, cutCandidates, promotionCandidates });

    if (!cutCandidates.length && !promotionCandidates.length) {
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
      countsAfter[slot] -= 1;
      usedPlayers.add(selectedPlayer.name);
      operations.push({ kind: "cut", playerName: selectedPlayer.name, sourceSlot: slot });
      continue;
    }

    if (!decision.destinationSlot || !selectedPlayer.promotionDestinations.includes(decision.destinationSlot)) {
      errors.push(`La destinazione della promozione di ${selectedPlayer.name} non è consentita.`);
      return { complete: false, countsAfter, operations, steps, errors };
    }
    countsAfter[slot] -= 1;
    countsAfter[decision.destinationSlot] += 1;
    currentSlots.set(selectedPlayer.name, decision.destinationSlot);
    usedPlayers.add(selectedPlayer.name);
    operations.push({
      kind: "promote",
      playerName: selectedPlayer.name,
      sourceSlot: slot,
      destinationSlot: decision.destinationSlot,
    });
  }

  return { complete: false, countsAfter, operations, steps, errors };
}

export function emptyContextualSlotDecision(): ContextualSlotDecision {
  return { kind: "", playerName: "", destinationSlot: "" };
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
    if (
      !["cut", "promote"].includes(String(kind))
      || !playerName
      || playerName.length > 120
      || (destinationSlot !== "" && !contextualSlotOrder.includes(destinationSlot as ContextualSlot))
      || (kind === "cut" && destinationSlot !== "")
      || (kind === "promote" && destinationSlot === "")
    ) {
      throw new Error("Operazioni contestuali non valide.");
    }
    return { kind: kind as "cut" | "promote", playerName, destinationSlot: destinationSlot as ContextualSlot | "" };
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
