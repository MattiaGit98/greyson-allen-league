import { CompetitionExplorer } from "@/components/competition-explorer";
import { loadCompetitionState } from "@/lib/competition-store";

export default async function CompetitionsPage() {
  const { competitions, teams } = await loadCompetitionState();
  return (
    <section className="section workbook-page">
      <CompetitionExplorer competitions={competitions} teams={teams} />
    </section>
  );
}
