import { ContentEditor } from "./content-editor";
import { loadCompetitionState } from "@/lib/competition-store";

export default async function PublicContentAdminPage() {
  const { competitions, teams, configured } = await loadCompetitionState();
  return (
    <section className="section page-top admin-content-page">
      {!configured && <p className="notice error">Il database di classifiche e tabelloni non è ancora configurato.</p>}
      <ContentEditor competitions={competitions} teams={teams} />
    </section>
  );
}
