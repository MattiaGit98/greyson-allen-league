import type { RosterEntry } from "./league-types";
import { isSecondContractYear } from "./slot-eligibility";

export function requiresSecondYearTwoWayPromotion(entry: RosterEntry, completedSeasonName: string) {
  const contract = entry.contract.trim().toLocaleUpperCase("it");
  const hasKnownLifecycle = Boolean(
    entry.contractStartSeason
    || entry.teamOptionFinalYear
    || entry.freeAgentSignedSeason,
  );
  return entry.state === "active"
    && entry.slot === "two_way"
    && Boolean(contract)
    && contract !== "T.O."
    && contract !== "-"
    && contract !== "DA ASSEGNARE"
    && contract !== "PENDING"
    && (isSecondContractYear(entry, completedSeasonName) || !hasKnownLifecycle);
}

export function requiresPlayoffTeamOptionPromotion(entry: RosterEntry, seasonName: string) {
  return entry.playoffTeamOptionPromotionSeason === seasonName
    && entry.state === "active"
    && (entry.slot === "g_league" || entry.slot === "two_way");
}

export function applySecondYearTwoWayPromotion(entry: RosterEntry, completedSeasonName: string): RosterEntry {
  return requiresSecondYearTwoWayPromotion(entry, completedSeasonName)
    ? { ...entry, slot: "regular", twoWayPromotionLocked: true }
    : entry;
}

export function applyPlayoffTeamOptionPromotion(entry: RosterEntry, seasonName: string): RosterEntry {
  if (!requiresPlayoffTeamOptionPromotion(entry, seasonName)) return entry;
  return {
    ...entry,
    slot: "regular",
    playoffTeamOptionPromotionSeason: undefined,
    twoWayPromotionLocked: true,
  };
}
