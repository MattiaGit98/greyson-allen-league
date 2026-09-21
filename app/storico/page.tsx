import { HistoryExplorer } from "@/components/history-explorer";
import { loadHistoryCompetitionState } from "@/lib/history-competition-store";
import { isHistoryCompetitionName } from "@/lib/history-competitions";
import { loadEditableLeagueState } from "@/lib/league-state";
import { nextDraftYear } from "@/lib/draft-positions";
import { synchronizeUnassignedDraftOwners } from "@/lib/draft-history";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ category?: string; season?: string }> }) {
  const query = await searchParams;
  const [{ competitions }, leagueState] = await Promise.all([loadHistoryCompetitionState(), loadEditableLeagueState()]);
  const openDraftYear = nextDraftYear(leagueState.draftAssets);
  const visibleCompetitions = openDraftYear !== null && (leagueState.finalizedDraftPositionYears ?? []).includes(openDraftYear)
    ? { ...competitions, Draft: synchronizeUnassignedDraftOwners(competitions.Draft, leagueState.draftAssets, [openDraftYear]).entries }
    : competitions;
  const initialName = typeof query.category === "string" && isHistoryCompetitionName(query.category) ? query.category : undefined;
  const initialSeason = initialName && visibleCompetitions[initialName].some((entry) => entry.season === query.season)
    ? query.season
    : undefined;
  return (
    <section className="section workbook-page">
      <HistoryExplorer key={`${initialName ?? ""}-${initialSeason ?? ""}`} competitions={visibleCompetitions} initialName={initialName} initialSeason={initialSeason} />
    </section>
  );
}
