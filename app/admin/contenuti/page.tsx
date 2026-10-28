import { ContentEditor } from "./content-editor";
import { loadCompetitionState } from "@/lib/competition-store";
import { loadEditableLeagueState } from "@/lib/league-state";

export default async function PublicContentAdminPage() {
  const [{ competitions, teams }, state] = await Promise.all([loadCompetitionState(), loadEditableLeagueState()]);
  return (
    <section className="section page-top admin-content-page">
      <ContentEditor competitions={competitions} teams={teams} homepageCompetition={state.homepageCompetition ?? null} />
    </section>
  );
}
