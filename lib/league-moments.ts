export const leagueMoments = [
  "offseason_start",
  "team_option_deadline",
  "auction_start",
  "auction_completed",
  "contract_delivery",
  "trade_deadline",
  "buyout_end",
  "free_agency_end",
  "free_agency_reopening",
] as const;

export type LeagueMoment = (typeof leagueMoments)[number];
export type LeagueTransition = LeagueMoment | "season_end";

export const leagueMomentLabels: Record<LeagueTransition, string> = {
  offseason_start: "Inizio offseason",
  team_option_deadline: "Scadenza T.O. e R.E.",
  auction_start: "Inizio asta",
  auction_completed: "Termine asta",
  contract_delivery: "Consegna contratti",
  trade_deadline: "Trade deadline",
  buyout_end: "Termine buyout",
  free_agency_end: "Chiusura free agency",
  free_agency_reopening: "Riapertura free agency",
  season_end: "Fine stagione",
};

export type MomentSeason = {
  timeline_moment?: unknown;
};

export function isLeagueMoment(value: unknown): value is LeagueMoment {
  return typeof value === "string" && (leagueMoments as readonly string[]).includes(value);
}

export function leagueMomentFromSeason(season: MomentSeason): LeagueMoment {
  if (isLeagueMoment(season.timeline_moment)) return season.timeline_moment;
  throw new Error("Momento della lega non valido o non inizializzato.");
}

export function nextLeagueTransition(moment: LeagueMoment): LeagueTransition {
  const index = leagueMoments.indexOf(moment);
  return index === leagueMoments.length - 1 ? "season_end" : leagueMoments[index + 1];
}

export function momentIndex(moment: LeagueMoment) {
  return leagueMoments.indexOf(moment);
}

export function hasReachedMoment(current: LeagueMoment, target: LeagueMoment) {
  return momentIndex(current) >= momentIndex(target);
}

export function macroPhaseForMoment(moment: LeagueMoment): "offseason" | "regular_season" {
  return hasReachedMoment(moment, "auction_completed") ? "regular_season" : "offseason";
}

export function publicPhaseLabel(moment: LeagueMoment, postseasonStartDate?: string, today?: string) {
  if (hasReachedMoment(moment, "free_agency_end")) {
    if (postseasonStartDate && today && postseasonStartDate > today) return "Regular season";
    return "Postseason";
  }
  return macroPhaseForMoment(moment) === "offseason" ? "Offseason" : "Regular season";
}

export function teamOptionsAreResolved(moment: LeagueMoment) {
  return hasReachedMoment(moment, "team_option_deadline");
}

export function tradeDeadlineHasPassed(moment: LeagueMoment) {
  return hasReachedMoment(moment, "trade_deadline");
}

export function tradesAreSuspendedForAuction(moment: LeagueMoment) {
  return hasReachedMoment(moment, "auction_start") && !hasReachedMoment(moment, "auction_completed");
}

export const operationWindows = {
  teamOption: (moment: LeagueMoment) => moment === "offseason_start",
  draft: (moment: LeagueMoment) => hasReachedMoment(moment, "team_option_deadline") && !hasReachedMoment(moment, "auction_start"),
  auction: (moment: LeagueMoment) => hasReachedMoment(moment, "auction_start") && !hasReachedMoment(moment, "auction_completed"),
  contractAssignment: (moment: LeagueMoment) => moment === "auction_completed",
  freeAgency: (moment: LeagueMoment) => (
    (hasReachedMoment(moment, "contract_delivery") && !hasReachedMoment(moment, "free_agency_end"))
    || hasReachedMoment(moment, "free_agency_reopening")
  ),
  trades: (moment: LeagueMoment) => (
    !tradesAreSuspendedForAuction(moment)
    && !hasReachedMoment(moment, "trade_deadline")
  ),
  extensions: (moment: LeagueMoment) => !hasReachedMoment(moment, "auction_start"),
  buyout: (moment: LeagueMoment) => hasReachedMoment(moment, "auction_completed") && !hasReachedMoment(moment, "buyout_end"),
  freeRelease: (moment: LeagueMoment) => !hasReachedMoment(moment, "free_agency_end"),
  dpeActivation: (moment: LeagueMoment) => (
    (!hasReachedMoment(moment, "auction_start") || hasReachedMoment(moment, "auction_completed"))
    && !hasReachedMoment(moment, "trade_deadline")
  ),
  dpeReintegration: (moment: LeagueMoment) => (
    hasReachedMoment(moment, "auction_completed")
    && !hasReachedMoment(moment, "free_agency_end")
  ),
  scheduledCut: (moment: LeagueMoment) => moment === "free_agency_reopening",
};
