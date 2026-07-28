import { result } from "./types";

export type ManagedLeaguePhase = "offseason" | "auction" | "regular_season";

export function validatePhaseTransition(from: ManagedLeaguePhase, to: ManagedLeaguePhase) {
  const allowed: Record<ManagedLeaguePhase, ManagedLeaguePhase[]> = {
    offseason: ["offseason", "auction"],
    auction: ["auction", "offseason", "regular_season"],
    regular_season: ["regular_season", "offseason"],
  };
  const valid = allowed[from].includes(to);
  return result(
    { from, to },
    ["1(l)", "4(a)", "5(a)", "13(a-b)"],
    valid ? [] : [{ code: "INVALID_PHASE_TRANSITION", message: `Non è consentito passare direttamente da ${from} a ${to}.` }],
  );
}
