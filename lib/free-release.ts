import { hasReachedMoment, tradesAreSuspendedForAuction, type LeagueMoment } from "./league-moments";
import { previousSeasonName } from "./season-time";

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
  one_credit_team_option: "Team option da 1 credito non ancora garantita",
};

export type FreeReleasePlayer = {
  cost: number;
  contract: string;
  state: "active" | "cut";
  dpeAppliedSeasons?: string[];
};

export function hadDpeInPreviousSeason(player: FreeReleasePlayer, seasonName: string) {
  return player.dpeAppliedSeasons?.includes(previousSeasonName(seasonName)) ?? false;
}

export function isFreeReleaseReason(value: string): value is FreeReleaseReason {
  return (freeReleaseReasonValues as readonly string[]).includes(value);
}

export function freeReleaseReasonAvailability(
  reason: FreeReleaseReason,
  moment: LeagueMoment,
  player: FreeReleasePlayer,
  seasonName: string,
): { available: boolean; unavailableReason?: string } {
  if (reason === "no_nba_roster") {
    const available = hasReachedMoment(moment, "team_option_deadline")
      && !hasReachedMoment(moment, "free_agency_end")
      && !tradesAreSuspendedForAuction(moment);
    return available
      ? { available: true }
      : { available: false, unavailableReason: "Disponibile dalla scadenza delle T.O. al Termine free agency, ma non durante l'asta." };
  }

  if (reason === "suspension_or_legal") {
    const available = hasReachedMoment(moment, "team_option_deadline")
      && !hasReachedMoment(moment, "trade_deadline")
      && !tradesAreSuspendedForAuction(moment);
    return available
      ? { available: true }
      : { available: false, unavailableReason: "Disponibile dalla scadenza delle T.O. alla Trade deadline, ma non durante l'asta." };
  }

  if (reason === "under_half_games") {
    if (player.state !== "active") {
      return { available: false, unavailableReason: "Questa causale è riservata ai giocatori non ancora tagliati." };
    }
    if (hadDpeInPreviousSeason(player, seasonName)) {
      return { available: false };
    }
    const available = !hasReachedMoment(moment, "auction_start");
    return available
      ? { available: true }
      : { available: false, unavailableReason: "Disponibile dall’inizio dell’offseason fino all’inizio dell’asta." };
  }

  const windowOpen = hasReachedMoment(moment, "team_option_deadline")
    && !hasReachedMoment(moment, "contract_delivery");
  const eligibleContract = player.cost === 1 && player.contract.trim().toLocaleUpperCase("it-IT") === "T.O.";
  if (!windowOpen) return { available: false, unavailableReason: "Disponibile dalla scadenza delle T.O. fino alla Consegna contratti." };
  if (!eligibleContract) return { available: false, unavailableReason: "Richiede una T.O. da 1 credito." };
  return { available: true };
}

export function availableFreeReleaseReasons(moment: LeagueMoment, player: FreeReleasePlayer, seasonName: string) {
  return freeReleaseReasonValues.filter((reason) => freeReleaseReasonAvailability(reason, moment, player, seasonName).available);
}
