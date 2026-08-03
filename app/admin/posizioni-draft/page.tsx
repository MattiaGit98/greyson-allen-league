import { DraftPositionPanel } from "./position-panel";
import { inferLegacyDraftOrigins } from "@/lib/draft-order-bootstrap";
import { defaultDraftPositionCount, draftRoundForPosition, nextDraftYear } from "@/lib/draft-positions";
import { loadHistoryCompetitionState } from "@/lib/history-competition-store";
import { loadEditableLeagueState } from "@/lib/league-state";

export default async function DraftPositionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const query = await searchParams;
  const [leagueState, history] = await Promise.all([
    loadEditableLeagueState(),
    loadHistoryCompetitionState(),
  ]);
  const draftYear = nextDraftYear(leagueState.draftAssets);
  const teams = leagueState.teams.map((team) => ({ code: team.code, name: team.name }));
  const savedAssignments = (leagueState.draftOrders ?? []).filter((assignment) => assignment.year === draftYear);
  const finalized = draftYear !== null && (leagueState.finalizedDraftPositionYears ?? []).includes(draftYear);
  const expectedPositionCount = draftYear === null ? 0 : defaultDraftPositionCount(draftYear, teams.length);
  const positionCount = savedAssignments.length || expectedPositionCount;
  const inferredOrigins = draftYear === null ? new Map<number, string>() : inferLegacyDraftOrigins({
    draftYear,
    positionCount,
    teams,
    draftAssets: leagueState.draftAssets,
    regularSeasonEntries: history.competitions["Regular season"],
    playoffEntries: history.competitions.Playoff,
  });
  const savedByPosition = new Map(savedAssignments.map((assignment) => [assignment.position, assignment]));
  const initialAssignments = Array.from({ length: positionCount }, (_, index) => {
    const position = index + 1;
    const saved = savedByPosition.get(position);
    return {
      position,
      originTeamCode: saved ? saved.originTeamCode : inferredOrigins.get(position) || "",
      isBonus: saved?.isBonus ?? false,
      round: saved?.round ?? draftRoundForPosition(position, expectedPositionCount),
    };
  });

  return (
    <section className="section page-top admin-dashboard">
      {query.updated && <p className="notice success">{query.updated}</p>}
      {query.error && <p className="notice error">Aggiornamento non riuscito: {query.error}</p>}
      <DraftPositionPanel
        draftYear={draftYear}
        teams={teams}
        initialAssignments={initialAssignments}
        finalized={finalized}
      />
    </section>
  );
}
