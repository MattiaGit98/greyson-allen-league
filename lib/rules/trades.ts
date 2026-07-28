import { validateSlots, type SlotCounts } from "./roster";
import { result } from "./types";

export type TradeSide = { teamId: string; ownsAllPlayers: boolean; creditsAfter: number; slotsAfter: SlotCounts };

export function evaluateTrade(sides: TradeSide[], windowOpen: boolean, auctionActive: boolean) {
  const errors = [];
  if (!windowOpen) errors.push({ code: "TRADE_WINDOW_CLOSED", message: "Il mercato degli scambi è chiuso." });
  if (auctionActive) errors.push({ code: "TRADE_DURING_AUCTION", message: "Non si possono concludere scambi durante l’asta." });
  for (const side of sides) {
    if (!side.ownsAllPlayers) errors.push({ code: "PLAYER_NOT_OWNED", message: "Una squadra non possiede tutti i giocatori ceduti." });
    if (side.creditsAfter < 0) errors.push({ code: "NEGATIVE_CREDITS", message: "Il saldo crediti finale non può essere negativo." });
    if (!validateSlots(side.slotsAfter).valid) errors.push({ code: "ROSTER_LIMIT", message: "La rosa finale supera un limite di slot." });
  }
  return result({ teams: sides.length }, ["13(a-i)", "2(a)"], errors);
}
