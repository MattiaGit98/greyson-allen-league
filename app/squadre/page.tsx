import { TeamAccordion } from "./team-accordion";
import { loadEditableLeagueState } from "@/lib/league-state";
import { hasReachedMoment, leagueMomentFromSeason } from "@/lib/league-moments";
import { shouldCountTeamOptions } from "@/lib/season-time";
import { requireActiveSeason } from "@/lib/active-season";
import { roleMinimumChecksApply } from "@/lib/role-minimums";
import { buildPublicPlayerListRows } from "@/lib/public-player-list";
import { recentAuctionCallsFromFeed, type AuctionCallFeedRow } from "@/lib/auction-call-feed";
import { projectedDpeRosterOverflowByTeam } from "@/lib/league-advance";

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
  const capSeasonName = activeSeason.season.name;
  const teamOptionsResolved = activeSeason.season.team_options_resolved;
  const countTeamOptions = shouldCountTeamOptions(phase, teamOptionsResolved);
  const leagueMoment = leagueMomentFromSeason(activeSeason.season);
  const seasonEndOverflowByTeam = hasReachedMoment(leagueMoment, "auction_completed")
    ? projectedDpeRosterOverflowByTeam({
      seasonName: activeSeason.season.name,
      rosterEntries: leagueState.rosterEntries,
      qualifyingOfferRights: leagueState.qualifyingOfferRights,
      playerList: leagueState.playerList,
    })
    : {};
  const pendingAuctionContracts = hasReachedMoment(leagueMoment, "auction_start")
    && !hasReachedMoment(leagueMoment, "contract_delivery");
  const showAuctionCalls = hasReachedMoment(leagueMoment, "auction_start")
    && !hasReachedMoment(leagueMoment, "auction_completed");
  const auctionCalls = showAuctionCalls
    ? buildPublicPlayerListRows(leagueState).filter((row) => !row.rosterTeamCode).slice(0, 30)
    : [];
  const recentAuctionCallResponse = showAuctionCalls
    ? await activeSeason.supabase
      .from("league_movement_feed")
      .select("id,created_at,auction_player_name,auction_team_code,auction_cost,auction_role")
      .eq("operation_type", "acquisto_asta")
      .eq("reverted", false)
      .eq("auction_season_name", activeSeason.season.name)
      .order("created_at", { ascending: false })
      .limit(10)
    : null;
  if (recentAuctionCallResponse?.error) {
    throw new Error(`Ultime chiamate dell'asta non disponibili: ${recentAuctionCallResponse.error.message}`);
  }
  const recentAuctionCalls = recentAuctionCallsFromFeed(
    (recentAuctionCallResponse?.data ?? []) as AuctionCallFeedRow[],
    leagueState.playerList,
  );

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
        seasonEndOverflowByTeam={seasonEndOverflowByTeam}
        initialTeam={query.team?.toUpperCase()}
        initialPlayer={query.player}
        showQualifyingOffers={!hasReachedMoment(leagueMoment, "auction_completed")}
        capSeasonName={capSeasonName}
        countTeamOptions={countTeamOptions}
        pendingAuctionContracts={pendingAuctionContracts}
        capScaleMaximum={hasReachedMoment(leagueMoment, "auction_completed") ? 1100 : 1000}
        leagueMoment={leagueMoment}
        auctionCalls={auctionCalls}
        recentAuctionCalls={recentAuctionCalls}
        showAuctionCallPanels={showAuctionCalls}
      />
    </section>
  );
}
