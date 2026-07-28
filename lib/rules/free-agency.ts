import { validateCapOperation } from "./credits";

export function evaluateFreeAgentPurchase(currentCost: number, price: number) {
  return validateCapOperation(currentCost, price, "regular_season", true);
}
