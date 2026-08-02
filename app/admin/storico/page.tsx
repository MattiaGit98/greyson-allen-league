import { HistoryEditor } from "./history-editor";
import { loadHistoryCompetitionState } from "@/lib/history-competition-store";

export default async function HistoryAdminPage() {
  const { competitions, configured } = await loadHistoryCompetitionState();
  return (
    <section className="section page-top admin-content-page history-admin-page">
      {!configured && <p className="notice error">Il database dello storico non è ancora configurato.</p>}
      <HistoryEditor competitions={competitions} />
    </section>
  );
}
