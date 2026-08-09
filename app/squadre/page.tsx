import { TeamAccordion } from "./team-accordion";
import { loadEditableLeagueState } from "@/lib/league-state";
import { leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";
import { displayedSeasonName, shouldCountTeamOptions } from "@/lib/season-time";
import { requireActiveSeason } from "@/lib/active-season";

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
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
  const pendingAuctionContracts = operationWindows.contractAssignment(leagueMomentFromSeason(activeSeason.season));

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
        inSeason={phase === "regular_season"}
        initialTeam={query.team?.toUpperCase()}
        showQualifyingOffers={phase === "offseason"}
        capSeasonName={capSeasonName}
        countTeamOptions={countTeamOptions}
        pendingAuctionContracts={pendingAuctionContracts}
      />
    </section>
  );
}
