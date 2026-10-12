import { hasReachedMoment, tradesAreSuspendedForAuction, type LeagueMoment } from "./league-moments";
import { previousSeasonName } from "./season-time";
import { isAnnualTeamOptionContract } from "./team-option-contract";
import { allowedPostAuctionContracts, isPostAuctionContractAssignmentCandidate } from "./auction-management";
import type { AuctionAcquisitionKind } from "./league-types";

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
  under_half_games: "Meno del 40% delle partite nella precedente regular season NBA",
  one_credit_team_option: "Team option o contratto da assegnare eleggibile per la team option da 1 credito",
};

export type FreeReleasePlayer = {
  cost: number;
  contract: string;
  state: "active" | "cut";
  dpeAppliedSeasons?: string[];
  rookie?: boolean;
  under23?: boolean;
  auctionPrice?: number;
  auctionAcquisition?: AuctionAcquisitionKind;
  contractStartSeason?: string;
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
  if (player.state === "cut" && player.cost === 0) {
    return { available: false, unavailableReason: "Il giocatore è già stato rilasciato gratuitamente." };
  }

  if (reason === "no_nba_roster") {
    const available = hasReachedMoment(moment, "team_option_deadline")
      && !hasReachedMoment(moment, "free_agency_end")
      && !tradesAreSuspendedForAuction(moment);
    return available
      ? { available: true }
      : { available: false, unavailableReason: "Disponibile dalla scadenza delle T.O. alla Chiusura free agency, ma non durante l'asta." };
  }

  if (reason === "suspension_or_legal") {
    const available = hasReachedMoment(moment, "team_option_deadline")
      && !hasReachedMoment(moment, "free_agency_end")
      && !tradesAreSuspendedForAuction(moment);
    return available
      ? { available: true }
      : { available: false, unavailableReason: "Disponibile dalla scadenza delle T.O. alla Chiusura free agency, ma non durante l'asta." };
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
  const eligibleContract = isOneCreditTeamOptionReleaseEligible(player, seasonName);
  if (!windowOpen) return { available: false, unavailableReason: "Disponibile dalla scadenza delle T.O. fino alla Consegna contratti." };
  if (!eligibleContract) return { available: false, unavailableReason: "Richiede una T.O. da 1 credito oppure un contratto da assegnare da 1 credito eleggibile per la T.O." };
  return { available: true };
}

export function isOneCreditTeamOptionReleaseEligible(player: FreeReleasePlayer, seasonName: string) {
  const acquisitionPrice = player.auctionPrice ?? player.cost;
  if (acquisitionPrice !== 1) return false;
  if (isAnnualTeamOptionContract(player)) return true;
  if (!isPostAuctionContractAssignmentCandidate(player, seasonName)) return false;
  if (!allowedPostAuctionContracts(player.auctionAcquisition).includes("team_option")) return false;
  return player.rookie === true || player.under23 === true;
}

export function availableFreeReleaseReasons(moment: LeagueMoment, player: FreeReleasePlayer, seasonName: string) {
  return freeReleaseReasonValues.filter((reason) => freeReleaseReasonAvailability(reason, moment, player, seasonName).available);
}
