import { TeamIdentityEditor } from "./team-identity-editor";
import { loadEditableLeagueState } from "@/lib/league-state";

export default async function TeamIdentityPage() {
  const leagueState = await loadEditableLeagueState();
  return (
    <section className="section page-top admin-dashboard team-identity-page">
      <TeamIdentityEditor teams={leagueState.teams} />
    </section>
  );
}
