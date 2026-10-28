import { HistoryEditor } from "./history-editor";
import { loadHistoryCompetitionState } from "@/lib/history-competition-store";
import { loadEditableLeagueState } from "@/lib/league-state";

export default async function HistoryAdminPage() {
  const [{ competitions }, state] = await Promise.all([loadHistoryCompetitionState(), loadEditableLeagueState()]);
  return (
    <section className="section page-top admin-content-page history-admin-page">
      <HistoryEditor competitions={competitions} homepageHonoursTable={state.homepageHonoursTable ?? ""} />
    </section>
  );
}
