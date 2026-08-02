import { validateCapOperation } from "./credits";
import { validateSlots, type SlotCounts } from "./roster";
import { result } from "./types";

export function evaluateAuctionPurchase(input: { currentCost: number; price: number; slots: SlotCounts; playerAlreadyOwned: boolean }) {
  const cap = validateCapOperation(input.currentCost, input.price, "auction");
  const slots = validateSlots({ ...input.slots, regular: input.slots.regular + 1 });
  const errors = [];
  const warnings = [...cap.errors, ...cap.warnings];
  if (input.playerAlreadyOwned) errors.push({ code: "PLAYER_ALREADY_OWNED", message: "Il giocatore appartiene già a una squadra." });
  if (!slots.valid) warnings.push({ code: "ROSTER_MOVE_REQUIRED", message: "Dopo l’acquisto deve essere liberato uno slot." });
  return result({ costAfter: cap.calculated.after, slotsAfter: slots.calculated.total }, ["4(g)", ...cap.appliedRules], errors, warnings);
}
