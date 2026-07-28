import { result } from "./types";

export type CapPhase = "offseason" | "draft" | "auction" | "regular_season";

export function validateCapOperation(currentCost: number, delta: number, phase: CapPhase, isFreeAgent = false) {
  const after = currentCost + delta;
  const errors = [];
  if (phase === "offseason" && after > 1000) errors.push({ code: "OFFSEASON_CAP", message: "In offseason il cap non può superare 1.000." });
  if (phase === "auction" && after > 1000 && delta > 1) errors.push({ code: "AUCTION_OVER_CAP_MAX_ONE", message: "Oltre quota 1.000, in asta si può acquistare solo a 1 credito." });
  if (phase === "regular_season" && currentCost > 1100 && delta > 0) errors.push({ code: "IN_SEASON_FROZEN", message: "Sopra quota 1.100 non sono ammesse operazioni che aumentano il cap." });
  if (phase === "regular_season" && isFreeAgent && after > 1000 && delta > 1) errors.push({ code: "FREE_AGENT_MAX_ONE", message: "Il free agent può essere acquistato solo a 1 credito." });
  return result({ currentCost, delta, after, capSpace: Math.max(0, 1000 - after) }, ["9(a-e)"], errors);
}
