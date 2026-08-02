import type { RosterEntry, TeamSummary } from "./league-types";
import { isSecondContractYear } from "./slot-eligibility";

export type TwoWayPromotionTeam = {
  teamCode: string;
  teamName: string;
  players: string[];
  regularSlotsUsed: number;
  regularSlotsAvailable: number;
  shortfall: number;
};

export type TwoWayPromotionReport = {
  teams: TwoWayPromotionTeam[];
  totalPlayers: number;
  totalShortfall: number;
  blockedTeams: TwoWayPromotionTeam[];
};

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

function buildPromotionReport(
  teams: Pick<TeamSummary, "code" | "name">[],
  rosterEntries: RosterEntry[],
  isDue: (entry: RosterEntry) => boolean,
): TwoWayPromotionReport {
  const promotionTeams = teams.flatMap((team) => {
    const entries = rosterEntries.filter((entry) => entry.teamCode === team.code);
    const players = entries.filter(isDue).map((entry) => entry.name);
    if (!players.length) return [];
    const regularSlotsUsed = entries.filter((entry) => entry.state === "active" && entry.slot === "regular").length;
    const regularSlotsAvailable = Math.max(0, 15 - regularSlotsUsed);
    return [{
      teamCode: team.code,
      teamName: team.name,
      players,
      regularSlotsUsed,
      regularSlotsAvailable,
      shortfall: Math.max(0, players.length - regularSlotsAvailable),
    }];
  });

  return {
    teams: promotionTeams,
    totalPlayers: promotionTeams.reduce((total, team) => total + team.players.length, 0),
    totalShortfall: promotionTeams.reduce((total, team) => total + team.shortfall, 0),
    blockedTeams: promotionTeams.filter((team) => team.shortfall > 0),
  };
}

export function buildSecondYearTwoWayPromotionReport(
  teams: Pick<TeamSummary, "code" | "name">[],
  rosterEntries: RosterEntry[],
  completedSeasonName: string,
) {
  return buildPromotionReport(
    teams,
    rosterEntries,
    (entry) => requiresSecondYearTwoWayPromotion(entry, completedSeasonName),
  );
}
