import type { AuctionAcquisitionKind } from "@/lib/league-types";
import { loadEditableLeagueState } from "@/lib/league-state";
import { calculateCapSpace, followingSeasonName, seasonEndYear, shouldCountTeamOptions } from "@/lib/season-time";
import { leagueMomentFromSeason, type LeagueMoment } from "@/lib/league-moments";
import { entriesForDpeAdjustedCap } from "@/lib/dpe-rules";
import { requireActiveSeason } from "@/lib/active-season";
import { isRookieExtensionContract, isRookieExtensionDecisionDue } from "@/lib/team-option-contract";

export type AdminRosterPlayer = {
  id: string;
  name: string;
  cost: number;
  currentCapCost: number;
  contract: string;
  expiryYear: number | null;
  role: "G" | "A" | "C" | null;
  slot: "regular" | "two_way" | "g_league" | "dpe";
  state: "active" | "cut";
  isTeamOption: boolean;
  isRookieExtension: boolean;
  isRookieExtensionDue: boolean;
  hasQualifyingRight: boolean;
  isExtensionEligible: boolean;
  stretchProvisionApplied: boolean;
  buyoutApplied: boolean;
  rookie: boolean;
  under23: boolean;
  auctionAcquisition?: AuctionAcquisitionKind;
  auctionPrice?: number;
  teamOptionBaseCost?: number;
  teamOptionFinalYear?: number;
  freeAgentSignedSeason?: string;
  endedPreviousSeasonInGLeague?: boolean;
  contractStartSeason?: string;
  twoWayPromotionLocked?: boolean;
  playoffTeamOptionPromotionSeason?: string;
  dpeAppliedSeasons?: string[];
};

export type AdminRosterTeam = {
  code: string;
  name: string;
  space: number;
  spaceBeforeOptions: number;
  nextSpace: number;
  followingSpace: number;
  players: AdminRosterPlayer[];
};

export type AdminOperationContext = {
  phase: string;
  seasonName: string;
  seasonEndYear: number;
  teamOptionsResolved: boolean;
  tradeDeadlinePassed: boolean;
  leagueMoment: LeagueMoment;
  teams: AdminRosterTeam[];
};

export async function getAdminOperationContext(): Promise<AdminOperationContext> {
  const [leagueState, activeSeason] = await Promise.all([
    loadEditableLeagueState(),
    requireActiveSeason(),
  ]);
  const phase = activeSeason.season.status;
  const seasonName = activeSeason.season.name;
  const currentSeasonEndYear = seasonEndYear(seasonName);
  if (currentSeasonEndYear === null) throw new Error(`Annata attiva non valida: ${seasonName}.`);
  const teamOptionsResolved = activeSeason.season.team_options_resolved;
  const tradeDeadlinePassed = activeSeason.season.trade_deadline_passed;
  const leagueMoment = leagueMomentFromSeason(activeSeason.season);
  const playerDetails = new Map(leagueState.playerList.map((player) => [
    player.name.trim().toLocaleLowerCase("it-IT"),
    player,
  ]));
  const countTeamOptions = shouldCountTeamOptions(
    phase as "offseason" | "auction" | "regular_season",
    teamOptionsResolved,
  );

  return {
    phase,
    seasonName,
    teamOptionsResolved,
    tradeDeadlinePassed,
    leagueMoment,
    seasonEndYear: currentSeasonEndYear,
    teams: leagueState.teams.map((team) => {
      const entries = leagueState.rosterEntries.filter((entry) => entry.teamCode === team.code);
      const capSpaceFor = (targetSeasonName: string, isCurrentSeason = false) => calculateCapSpace({
        entries: entriesForDpeAdjustedCap(entries, isCurrentSeason ? 0 : 1),
        seasonName: targetSeasonName,
        optionSeasonName: seasonName,
        countTeamOptions,
      });
      const capSpaceBeforeOptions = calculateCapSpace({
        entries: entries.filter((entry) => entry.state !== "active" || entry.slot !== "dpe"),
        seasonName,
        optionSeasonName: seasonName,
        countTeamOptions: false,
      });
      const nextSeasonName = followingSeasonName(seasonName);
      const followingSeason = followingSeasonName(seasonName, 2);
      return {
        code: team.code,
        name: team.name,
        space: capSpaceFor(seasonName, true),
        spaceBeforeOptions: capSpaceBeforeOptions,
        nextSpace: capSpaceFor(nextSeasonName),
        followingSpace: capSpaceFor(followingSeason),
        players: entries.map((entry, index) => {
          const listPlayer = entry.state === "active"
            ? playerDetails.get(entry.name.trim().toLocaleLowerCase("it-IT"))
            : undefined;
          const expiry = entry.contract.match(/\d{2}/)?.[0];
          const fullExpiryYear = expiry
            ? Math.floor(currentSeasonEndYear / 100) * 100 + Number(expiry)
            : null;
          return {
            id: `${team.code}:${index}:${entry.name}`,
            name: entry.name,
            cost: entry.cost,
            currentCapCost: 1000 - calculateCapSpace({
              entries: [entry],
              seasonName,
              optionSeasonName: seasonName,
              countTeamOptions,
            }),
            contract: entry.contract,
            expiryYear: fullExpiryYear,
            role: listPlayer && listPlayer.role !== "X" ? listPlayer.role : null,
            slot: entry.slot,
            state: entry.state,
            isTeamOption: entry.contract === "T.O.",
            isRookieExtension: isRookieExtensionContract(entry),
            isRookieExtensionDue: isRookieExtensionDecisionDue(entry, seasonName),
            hasQualifyingRight: entry.contract.includes("(Q)"),
            isExtensionEligible: entry.contract.includes("(E)"),
            stretchProvisionApplied: entry.stretchProvisionApplied === true,
            buyoutApplied: entry.buyoutApplied === true,
            rookie: listPlayer?.rookie ?? false,
            under23: listPlayer?.under23 ?? false,
            auctionAcquisition: entry.auctionAcquisition,
            auctionPrice: entry.auctionPrice,
            teamOptionBaseCost: entry.teamOptionBaseCost,
            teamOptionFinalYear: entry.teamOptionFinalYear,
            freeAgentSignedSeason: entry.freeAgentSignedSeason,
            endedPreviousSeasonInGLeague: entry.endedPreviousSeasonInGLeague,
            contractStartSeason: entry.contractStartSeason,
            twoWayPromotionLocked: entry.twoWayPromotionLocked,
            playoffTeamOptionPromotionSeason: entry.playoffTeamOptionPromotionSeason,
            dpeAppliedSeasons: entry.dpeAppliedSeasons,
          };
        }),
      };
    }),
  };
}
