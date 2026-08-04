import { DraftPositionPanel } from "./position-panel";
import { nextDraftYear } from "@/lib/draft-positions";
import { loadEditableLeagueState } from "@/lib/league-state";

export default async function DraftPositionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const query = await searchParams;
  const leagueState = await loadEditableLeagueState();
  const draftYear = nextDraftYear(leagueState.draftAssets);
  const teams = leagueState.teams.map((team) => ({ code: team.code, name: team.name }));
  const savedAssignments = (leagueState.draftOrders ?? []).filter((assignment) => assignment.year === draftYear);
  const finalized = draftYear !== null && (leagueState.finalizedDraftPositionYears ?? []).includes(draftYear);
  const initialPositionCount = savedAssignments.length || teams.length * 2;
  const savedByPosition = new Map(savedAssignments.map((assignment) => [assignment.position, assignment]));
  const initialAssignments = Array.from({ length: initialPositionCount }, (_, index) => {
    const position = index + 1;
    const saved = savedByPosition.get(position);
    const round = saved?.round ?? (index < teams.length ? "1° giro" : "2° giro");
    return {
      position,
      originTeamCode: saved?.originTeamCode ?? "",
      isBonus: saved?.isBonus ?? false,
      round,
      cost: saved ? saved.cost : round === "2° giro" ? 1 : null,
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
