import { RosterEditor } from "./roster-editor";
import { loadEditableLeagueState } from "@/lib/league-state";
import { shouldCountTeamOptions } from "@/lib/season-time";
import { requireActiveSeason } from "@/lib/active-season";

export default async function CorrectionsPage() {
  const [leagueState, activeSeason] = await Promise.all([
    loadEditableLeagueState(),
    requireActiveSeason(),
  ]);
  const phase = activeSeason.season.status;
  const seasonName = activeSeason.season.name;
  const countTeamOptions = shouldCountTeamOptions(
    phase,
    activeSeason.season.team_options_resolved,
  );

  return (
    <section className="section page-top admin-dashboard roster-editor-page">
      <RosterEditor
        teams={leagueState.teams}
        initialRosterEntries={leagueState.rosterEntries}
        initialDraftAssets={leagueState.draftAssets}
        initialQualifyingOffers={leagueState.qualifyingOfferRights}
        seasonName={seasonName}
        countTeamOptions={countTeamOptions}
      />
    </section>
  );
}
