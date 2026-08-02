import { HistoryExplorer } from "@/components/history-explorer";
import { loadHistoryCompetitionState } from "@/lib/history-competition-store";

export default async function HistoryPage() {
  const { competitions } = await loadHistoryCompetitionState();
  return (
    <section className="section workbook-page">
      <HistoryExplorer competitions={competitions} />
    </section>
  );
}
