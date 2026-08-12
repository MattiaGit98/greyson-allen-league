import { ContentEditor } from "./content-editor";
import { loadCompetitionState } from "@/lib/competition-store";
import { loadEditableLeagueState } from "@/lib/league-state";

export default async function PublicContentAdminPage() {
  const [{ competitions, teams, configured }, state] = await Promise.all([loadCompetitionState(), loadEditableLeagueState()]);
  return (
    <section className="section page-top admin-content-page">
      {!configured && <p className="notice error">Il database di classifiche e tabelloni non è ancora configurato.</p>}
      <ContentEditor competitions={competitions} teams={teams} homepageCompetition={state.homepageCompetition ?? null} />
    </section>
  );
}
