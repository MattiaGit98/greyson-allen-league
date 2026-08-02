import { result } from "./types";

export function discountedAuctionContract(price: number, years: 1 | 2 | 3) {
  const multiplier = years === 3 ? 0.9 : years === 2 ? 0.95 : 1;
  return result(
    { annualCost: Math.ceil(price * multiplier), discountPercent: Math.round((1 - multiplier) * 100) },
    ["3(c)"],
    price < 1 ? [{ code: "INVALID_PRICE", message: "Il prezzo deve essere almeno 1 credito." }] : [],
  );
}

export function assignedAuctionContract(
  auctionPrice: number,
  kind: "annual" | "biennial" | "triennial" | "team_option",
  currentSeasonEndYear: number,
) {
  if (kind === "team_option") {
    return {
      cost: auctionPrice,
      contract: "T.O.",
      auctionPrice,
      originalContractYears: undefined,
    } as const;
  }
  const years = kind === "triennial" ? 3 : kind === "biennial" ? 2 : 1;
  const discounted = discountedAuctionContract(auctionPrice, years);
  const expiry = String(currentSeasonEndYear + years - 1).slice(-2);
  const extensionMarker = years === 3 && auctionPrice >= 200 ? " (E)" : "";
  const qualifyingMarker = years === 1 && discounted.calculated.annualCost === 1 ? " (Q)" : "";
  return {
    cost: discounted.calculated.annualCost,
    contract: `${expiry}${extensionMarker || qualifyingMarker}`,
    auctionPrice,
    originalContractYears: years,
  } as const;
}

export type ExtensionInput = {
  currentCost: number;
  auctionCost: number;
  originalYears: number;
  yearsRemaining: number;
  extendedLastSeason: boolean;
  windowOpen: boolean;
};

export function evaluateExtension(input: ExtensionInput) {
  const errors = [];
  if (!input.windowOpen) errors.push({ code: "WINDOW_CLOSED", message: "La finestra per le estensioni è chiusa." });
  if (input.auctionCost < 200) errors.push({ code: "AUCTION_COST_TOO_LOW", message: "Il prezzo d’asta era inferiore a 200 crediti." });
  if (input.originalYears !== 3) errors.push({ code: "NOT_ORIGINAL_THREE_YEAR", message: "Il contratto non era originariamente triennale." });
  if (input.yearsRemaining > 1) errors.push({ code: "TOO_MANY_YEARS", message: "Il contratto ha più di una stagione residua." });
  if (input.extendedLastSeason) errors.push({ code: "EXTENDED_LAST_SEASON", message: "Il contratto è già stato esteso nella stagione precedente." });
  return result({ newCost: Math.ceil(input.currentCost * 1.25) }, ["3(d)"], errors);
}
