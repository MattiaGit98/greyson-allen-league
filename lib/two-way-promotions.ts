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

export function requiresMandatoryTwoWayPromotion(entry: RosterEntry, seasonName: string) {
  const contract = entry.contract.trim().toLocaleUpperCase("it");
  const playoffPromotionDue = entry.playoffTeamOptionPromotionSeason === seasonName
    && entry.state === "active"
    && (entry.slot === "g_league" || entry.slot === "two_way");
  if (playoffPromotionDue) return true;
  const hasKnownLifecycle = Boolean(
    entry.contractStartSeason
    || entry.teamOptionFinalYear
    || entry.freeAgentSignedSeason,
  );
  return entry.state === "active"
    && entry.slot === "two_way"
    && entry.endedPreviousSeasonInGLeague !== true
    && Boolean(contract)
    && contract !== "T.O."
    && contract !== "-"
    && contract !== "DA ASSEGNARE"
    && contract !== "PENDING"
    && (isSecondContractYear(entry, seasonName) || !hasKnownLifecycle);
}

export function applyMandatoryTwoWayPromotion(entry: RosterEntry, seasonName: string): RosterEntry {
  if (entry.playoffTeamOptionPromotionSeason === seasonName) {
    return {
      ...entry,
      slot: entry.state === "active" && (entry.slot === "g_league" || entry.slot === "two_way") ? "regular" : entry.slot,
      playoffTeamOptionPromotionSeason: undefined,
      twoWayPromotionLocked: entry.state === "active" && entry.slot !== "regular" ? true : entry.twoWayPromotionLocked,
    };
  }
  return requiresMandatoryTwoWayPromotion(entry, seasonName)
    ? { ...entry, slot: "regular", twoWayPromotionLocked: true }
    : entry;
}

export function buildTwoWayPromotionReport(
  teams: Pick<TeamSummary, "code" | "name">[],
  rosterEntries: RosterEntry[],
  seasonName: string,
): TwoWayPromotionReport {
  const promotionTeams = teams.flatMap((team) => {
    const entries = rosterEntries.filter((entry) => entry.teamCode === team.code);
    const players = entries.filter((entry) => requiresMandatoryTwoWayPromotion(entry, seasonName)).map((entry) => entry.name);
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
