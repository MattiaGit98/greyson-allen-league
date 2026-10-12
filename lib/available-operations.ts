import {
  hasReachedMoment,
  momentIndex,
  nextLeagueTransition,
  operationWindows,
  tradesAreSuspendedForAuction,
  type LeagueMoment,
  type LeagueTransition,
} from "./league-moments";
import { playoffTeamOptionWindowOpen, type PhaseDateMap } from "./phase-calendar";

export type AvailableOperation = {
  label: string;
  urgency?: "urgent" | "upcoming";
};

export function availableOperationsAt(moment: LeagueMoment, phaseDates: PhaseDateMap = {}, today = ""): AvailableOperation[] {
  const available: Array<AvailableOperation & { closesAt?: LeagueTransition }> = [];
  const add = (label: string, condition: boolean, closesAt?: LeagueTransition) => {
    if (condition) available.push({ label, closesAt });
  };

  add("Contratti da rookie", operationWindows.teamOption(moment), "team_option_deadline");
  add("Scambi", operationWindows.trades(moment), "trade_deadline");
  add("Free agent", operationWindows.freeAgency(moment), hasReachedMoment(moment, "free_agency_reopening") ? "season_end" : "free_agency_end");
  add("Estensioni contrattuali", operationWindows.extensions(moment), "auction_start");
  add("Buyout", operationWindows.buyout(moment), "buyout_end");
  add("Esercizio DPE", operationWindows.dpeActivation(moment), "trade_deadline");
  add("Reintegro anticipato DPE", operationWindows.dpeReintegration(moment), "free_agency_end");
  add("Segnalazione utilizzo G-League nei playoff", playoffTeamOptionWindowOpen(moment, phaseDates, today), "free_agency_reopening");
  add("Rilascio: meno del 40% della stagione NBA", !hasReachedMoment(moment, "auction_start"), "auction_start");
  add("Rilascio: T.O. da 1 credito", hasReachedMoment(moment, "team_option_deadline") && !hasReachedMoment(moment, "contract_delivery"), "contract_delivery");
  add("Rilascio: senza squadra o squalifiche", hasReachedMoment(moment, "team_option_deadline") && !hasReachedMoment(moment, "free_agency_end") && !tradesAreSuspendedForAuction(moment), "free_agency_end");

  available.push(
    { label: "Tagli" },
    { label: "Promozioni di slot" },
    { label: "Stretch provision" },
  );

  const nextTransition = nextLeagueTransition(moment);
  const followingTransition = nextTransition === "season_end" ? null : nextLeagueTransition(nextTransition);
  return available
    .sort((left, right) => closureOrder(left.closesAt) - closureOrder(right.closesAt) || left.label.localeCompare(right.label, "it"))
    .map(({ closesAt: _closesAt, ...operation }) => ({
      ...operation,
      urgency: _closesAt === nextTransition
        ? "urgent"
        : _closesAt === followingTransition
          ? "upcoming"
          : undefined,
    }));
}

function closureOrder(closesAt?: LeagueTransition) {
  if (!closesAt) return Number.POSITIVE_INFINITY;
  return closesAt === "season_end" ? Number.MAX_SAFE_INTEGER : momentIndex(closesAt);
}
