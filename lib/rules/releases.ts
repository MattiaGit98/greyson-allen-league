import { result } from "./types";

export function evaluateStandardCut(input: { contractCost: number; yearsRemaining: number }) {
  const errors = input.contractCost < 0 || input.yearsRemaining < 1
    ? [{ code: "INVALID_CONTRACT", message: "Costo o durata residua del contratto non sono validi." }]
    : [];
  return result(
    { slotFreed: 1, deadCapPerSeason: input.contractCost, yearsRemaining: input.yearsRemaining, playerBecomesFreeAgent: true },
    ["10(a)", "10(b)"],
    errors,
    [{ code: "REACQUISITION_BLOCK", message: "La squadra non potrà riacquistare il giocatore finché il dead cap rimane attivo." }],
  );
}

export function canTeamReacquirePlayer(hasActiveDeadCap: boolean) {
  return result(
    { canReacquire: !hasActiveDeadCap },
    ["10(b)"],
    hasActiveDeadCap ? [{ code: "ACTIVE_DEAD_CAP", message: "La squadra ha ancora un onere attivo per questo giocatore." }] : [],
  );
}
