import { hasReachedMoment, type LeagueMoment } from "./league-moments";

export const freeReleaseReasonValues = [
  "no_nba_roster",
  "suspension_or_legal",
  "under_half_games",
  "one_credit_team_option",
] as const;

export type FreeReleaseReason = (typeof freeReleaseReasonValues)[number];

export const freeReleaseReasonLabels: Record<FreeReleaseReason, string> = {
  no_nba_roster: "Non fa ufficialmente parte di alcun roster NBA da almeno 10 giorni",
  suspension_or_legal: "Squalifica o cause giudiziarie riportate da NBC Sports, con soglia regolamentare raggiunta",
  under_half_games: "Meno della metà delle partite nella precedente regular season NBA",
  one_credit_team_option: "Team option firmata per 1 credito e non ancora garantita",
};

export type FreeReleasePlayer = {
  cost: number;
  contract: string;
};

export function isFreeReleaseReason(value: string): value is FreeReleaseReason {
  return (freeReleaseReasonValues as readonly string[]).includes(value);
}

export function freeReleaseReasonAvailability(
  reason: FreeReleaseReason,
  moment: LeagueMoment,
  player: FreeReleasePlayer,
): { available: boolean; unavailableReason?: string } {
  if (reason === "no_nba_roster") {
    const available = hasReachedMoment(moment, "free_releases_start") && !hasReachedMoment(moment, "free_agency_end");
    return available
      ? { available: true }
      : { available: false, unavailableReason: "Disponibile da Inizio rilasci al Termine free agency." };
  }

  if (reason === "suspension_or_legal") {
    const available = hasReachedMoment(moment, "free_releases_start") && !hasReachedMoment(moment, "trade_deadline");
    return available
      ? { available: true }
      : { available: false, unavailableReason: "Disponibile da Inizio rilasci alla Trade deadline." };
  }

  if (reason === "under_half_games") {
    const available = !hasReachedMoment(moment, "auction_completed");
    return available
      ? { available: true }
      : { available: false, unavailableReason: "Disponibile in offseason prima dell’asta." };
  }

  const windowOpen = !hasReachedMoment(moment, "contract_delivery");
  const eligibleContract = player.cost === 1 && player.contract.trim().toLocaleUpperCase("it-IT") === "T.O.";
  if (!windowOpen) return { available: false, unavailableReason: "Disponibile soltanto prima della Consegna contratti." };
  if (!eligibleContract) return { available: false, unavailableReason: "Richiede una T.O. da 1 credito." };
  return { available: true };
}

export function availableFreeReleaseReasons(moment: LeagueMoment, player: FreeReleasePlayer) {
  return freeReleaseReasonValues.filter((reason) => freeReleaseReasonAvailability(reason, moment, player).available);
}
