import type { QualifyingOfferRight, RosterEntry } from "./league-types";
import { hasReachedMoment, type LeagueMoment } from "./league-moments";
import { followingSeasonName, seasonEndYear } from "./season-time";

export function destinationAfterTeamOptionExercise(
  source: RosterEntry["slot"],
  requestedForGLeague: "regular" | "two_way",
): RosterEntry["slot"] {
  if (source === "g_league") return requestedForGLeague;
  if (source === "two_way") return "regular";
  return source;
}

export function isUnresolvedTeamOption(entry: Pick<RosterEntry, "contract">, moment: LeagueMoment) {
  return entry.contract === "T.O." && !hasReachedMoment(moment, "team_option_deadline");
}

export function qualifyingOfferForDeclinedTeamOption(
  entry: Pick<RosterEntry, "name" | "cost" | "teamCode">,
): QualifyingOfferRight {
  return {
    playerName: entry.name,
    qualifyingAmount: entry.cost,
    teamCode: entry.teamCode,
  };
}

export function exercisedTeamOptionTerms(entry: Pick<RosterEntry, "contract" | "cost" | "teamOptionBaseCost" | "teamOptionFinalYear">) {
  const markerPresent = /\((?:2X|X2)\)/i.test(entry.contract);
  const contractYear = entry.contract.match(/\d{2}/)?.[0];
  const inferredFinalYear = contractYear ? 2000 + Number(contractYear) : null;
  const finalYear = entry.teamOptionFinalYear ?? (markerPresent ? inferredFinalYear : null);
  const baseCost = entry.teamOptionBaseCost ?? (markerPresent ? entry.cost : null);
  return finalYear && baseCost !== null ? { baseCost, finalYear, markerPresent } : null;
}

export function markExercisedTeamOption<T extends RosterEntry>(entry: T, finalYear: number): T {
  return {
    ...entry,
    teamOptionBaseCost: entry.cost,
    teamOptionFinalYear: finalYear,
  };
}

export function exercisePlayoffTeamOption<T extends RosterEntry>(entry: T, activeSeasonName: string): T {
  const activeEndYear = seasonEndYear(activeSeasonName);
  if (activeEndYear === null) throw new Error("Annata non valida.");
  const finalYear = activeEndYear + 2;
  return markExercisedTeamOption({
    ...entry,
    contract: `${String(finalYear).slice(-2)} (2X)`,
    playoffTeamOptionPromotionSeason: followingSeasonName(activeSeasonName),
  }, finalYear);
}

export function applyTeamOptionFinalYearDoubling<T extends RosterEntry>(entry: T, finalYear: number): T {
  const terms = exercisedTeamOptionTerms(entry);
  const baseCost = terms?.baseCost ?? entry.cost;
  return {
    ...entry,
    cost: baseCost * 2,
    contract: `${String(finalYear).slice(-2)} (Q)`,
    teamOptionBaseCost: baseCost,
    teamOptionFinalYear: finalYear,
  };
}

export function teamOptionCutAdjustment<T extends RosterEntry>(
  entry: T,
  currentSeasonEndYear: number,
  moment: LeagueMoment,
): { entry: T; adjusted: boolean } {
  const terms = exercisedTeamOptionTerms(entry);
  if (!terms || terms.finalYear < currentSeasonEndYear) return { entry, adjusted: false };
  const beforeAuctionStartPrecedingFinalYear = terms.finalYear > currentSeasonEndYear
    || !hasReachedMoment(moment, "auction_start");
  if (!beforeAuctionStartPrecedingFinalYear) return { entry, adjusted: false };

  const expiry = entry.contract.match(/\d{2}/)?.[0] ?? String(terms.finalYear).slice(-2);
  return {
    entry: {
      ...entry,
      cost: terms.baseCost,
      contract: expiry,
      teamOptionBaseCost: terms.baseCost,
      teamOptionFinalYear: terms.finalYear,
    },
    adjusted: true,
  };
}

export function applyStandardContractCut<T extends RosterEntry>(
  entry: T,
  currentSeasonEndYear: number,
  moment: LeagueMoment,
): T {
  const adjusted = teamOptionCutAdjustment(entry, currentSeasonEndYear, moment).entry;
  return {
    ...adjusted,
    state: "cut",
    slot: "regular",
  };
}
