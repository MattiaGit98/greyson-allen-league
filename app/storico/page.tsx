import { HistoryExplorer } from "@/components/history-explorer";
import { loadHistoryCompetitionState } from "@/lib/history-competition-store";
import { isHistoryCompetitionName } from "@/lib/history-competitions";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ category?: string; season?: string }> }) {
  const query = await searchParams;
  const { competitions } = await loadHistoryCompetitionState();
  const initialName = typeof query.category === "string" && isHistoryCompetitionName(query.category) ? query.category : undefined;
  const initialSeason = initialName && competitions[initialName].some((entry) => entry.season === query.season)
    ? query.season
    : undefined;
  return (
    <section className="section workbook-page">
      <HistoryExplorer key={`${initialName ?? ""}-${initialSeason ?? ""}`} competitions={competitions} initialName={initialName} initialSeason={initialSeason} />
    </section>
  );
}
