import { TeamAccordion } from "./team-accordion";
import { loadEditableLeagueState } from "@/lib/league-state";
import { hasReachedMoment, leagueMomentFromSeason } from "@/lib/league-moments";
import { displayedSeasonName, shouldCountTeamOptions } from "@/lib/season-time";
import { requireActiveSeason } from "@/lib/active-season";
import { roleMinimumChecksApply } from "@/lib/role-minimums";
import { buildPublicPlayerListRows } from "@/lib/public-player-list";

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; player?: string }>;
}) {
  const query = await searchParams;
  const [activeSeason, leagueState] = await Promise.all([
    requireActiveSeason(),
    loadEditableLeagueState(),
  ]);
  const phase = activeSeason.season.status;
  const capSeasonName = displayedSeasonName(activeSeason.season.name);
  const teamOptionsResolved = activeSeason.season.team_options_resolved;
  const countTeamOptions = shouldCountTeamOptions(phase, teamOptionsResolved);
  const leagueMoment = leagueMomentFromSeason(activeSeason.season);
  const pendingAuctionContracts = hasReachedMoment(leagueMoment, "auction_start")
    && !hasReachedMoment(leagueMoment, "contract_delivery");
  const showAuctionCalls = hasReachedMoment(leagueMoment, "auction_start")
    && !hasReachedMoment(leagueMoment, "auction_completed");
  const auctionCalls = showAuctionCalls
    ? buildPublicPlayerListRows(leagueState).filter((row) => !row.rosterTeamCode).slice(0, 30)
    : [];

  return (
    <section className="section teams-page">
      <TeamAccordion
        teams={leagueState.teams}
        rosterEntries={leagueState.rosterEntries}
        draftAssets={leagueState.draftAssets}
        finalizedDraftPositionYears={leagueState.finalizedDraftPositionYears ?? []}
        qualifyingOfferRights={leagueState.qualifyingOfferRights}
        playerList={leagueState.playerList}
        playerListPublished={leagueState.playerListStatus === "published"}
        inSeason={roleMinimumChecksApply(phase, leagueMoment)}
        initialTeam={query.team?.toUpperCase()}
        initialPlayer={query.player}
        showQualifyingOffers={!hasReachedMoment(leagueMoment, "auction_completed")}
        capSeasonName={capSeasonName}
        countTeamOptions={countTeamOptions}
        pendingAuctionContracts={pendingAuctionContracts}
        capScaleMaximum={hasReachedMoment(leagueMoment, "auction_completed") ? 1100 : 1000}
        leagueMoment={leagueMoment}
        auctionCalls={auctionCalls}
      />
    </section>
  );
}
