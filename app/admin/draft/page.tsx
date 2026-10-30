import { compareDraftPicks } from "@/lib/draft-rules";
import { draftTeamSlotCounts } from "@/lib/draft-assignment";
import { nextDraftYear } from "@/lib/draft-positions";
import { loadHistoryCompetitionState } from "@/lib/history-competition-store";
import { loadEditableLeagueState } from "@/lib/league-state";
import { calculateCapSpace, shouldCountTeamOptions } from "@/lib/season-time";
import { DraftPanel } from "./draft-panel";
import { leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";
import { requireActiveSeason } from "@/lib/active-season";

export default async function DraftAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; assigned?: string }>;
}) {
  const query = await searchParams;
  const [leagueState, history, activeSeason] = await Promise.all([
    loadEditableLeagueState(),
    loadHistoryCompetitionState(),
    requireActiveSeason(),
  ]);
  const seasonName = activeSeason.season.name;
  const phase = activeSeason.season.status;
  const countTeamOptions = shouldCountTeamOptions(phase, activeSeason.season.team_options_resolved);
  const draftYear = nextDraftYear(leagueState.draftAssets);
  const leagueMoment = leagueMomentFromSeason(activeSeason.season);
  const draftWindowOpen = operationWindows.draft(leagueMoment);
  const activeDraftYear = Number(seasonName.slice(0, 4));
  const officialListPublished = leagueState.playerListStatus === "published";
  const draftOpen = draftWindowOpen && officialListPublished && draftYear === activeDraftYear;
  const orderFinalized = draftYear !== null && (leagueState.finalizedDraftPositionYears ?? []).includes(draftYear);

  const ownedPlayers = new Set(leagueState.rosterEntries.map((entry) => normalizeName(entry.name)));
  const qualifyingPlayers = new Set(
    leagueState.qualifyingOfferRights.map((right) => normalizeName(right.playerName)),
  );

  const teamState = new Map(leagueState.teams.map((team) => {
    const entries = leagueState.rosterEntries.filter((entry) => entry.teamCode === team.code);
    return [team.code, {
      slots: draftTeamSlotCounts(leagueState, team.code),
      capSpace: calculateCapSpace({
        entries: entries.filter((entry) => entry.state !== "active" || entry.slot !== "dpe"),
        seasonName,
        optionSeasonName: seasonName,
        countTeamOptions,
      }),
    }];
  }));

  const picks = leagueState.draftAssets
    .map((pick, stateIndex) => ({
      id: `draft-${stateIndex}-${pick.teamCode}-${pick.year}-${pick.round}-${pick.originOrOverall}`,
      stateIndex,
      ...pick,
      price: pick.draftCost ?? null,
      ownerName: leagueState.teams.find((team) => team.code === pick.teamCode)?.name ?? pick.teamCode,
      slots: teamState.get(pick.teamCode)?.slots ?? { regular: 0, two_way: 0, g_league: 0, dpe: 0 },
      capSpace: teamState.get(pick.teamCode)?.capSpace ?? 1000,
    }))
    .filter((pick) => orderFinalized && (draftYear === null || pick.year === draftYear))
    .sort(compareDraftPicks);

  const draftedPlayers = new Set(history.competitions.Draft.flatMap((entry) => (
    entry.content.kind === "draft" ? entry.content.rows.map((row) => normalizeName(row.player)) : []
  )));
  const players = leagueState.playerList.filter((player) => {
    const name = normalizeName(player.name);
    return player.rookie && !ownedPlayers.has(name) && !qualifyingPlayers.has(name) && !draftedPlayers.has(name);
  });
  const draftHistory = history.competitions.Draft.find((entry) => entry.season === String(draftYear));
  const assignedCount = draftHistory?.content.kind === "draft"
    ? draftHistory.content.rows.filter((row) => row.team.trim() && row.player.trim()).length
    : 0;
  const expectedCount = draftHistory?.content.kind === "draft" ? draftHistory.content.rows.length : 0;

  return (
    <section className="section page-top admin-dashboard">
      {query.assigned && <p className="notice success">{query.assigned}</p>}
      {query.error && <p className="notice error">Assegnazione non riuscita: {query.error}</p>}
      {!draftWindowOpen && <p className="notice">Il Draft è disponibile dalla scadenza delle T.O. fino all’inizio dell’asta.</p>}
      {draftWindowOpen && !officialListPublished && <p className="notice">Pubblica il listone ufficiale per rendere operativo il Draft.</p>}
      {draftWindowOpen && draftYear !== null && draftYear !== activeDraftYear && (
        <p className="notice">Il Draft {draftYear} è visibile come prossimo Draft, ma potrà essere assegnato nell'annata {draftYear}/{String((draftYear + 1) % 100).padStart(2, "0")}.</p>
      )}
      <DraftPanel twoWaySlotLimit={leagueState.twoWaySlotLimit} draftYear={draftYear} picks={picks} players={players} assignedCount={assignedCount} expectedCount={expectedCount} draftOpen={draftOpen && orderFinalized} orderFinalized={orderFinalized} />
    </section>
  );
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("it-IT");
}
