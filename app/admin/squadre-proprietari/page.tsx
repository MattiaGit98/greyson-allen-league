import { TeamIdentityEditor } from "./team-identity-editor";
import { loadEditableLeagueState } from "@/lib/league-state";

export default async function TeamIdentityPage({ searchParams }: { searchParams: Promise<{ updated?: string; error?: string }> }) {
  const query = await searchParams;
  const leagueState = await loadEditableLeagueState();
  return (
    <section className="section page-top admin-dashboard team-identity-page">
      {query.updated && <p className="notice success">{query.updated}</p>}
      {query.error && <p className="notice error">{query.error}</p>}
      <TeamIdentityEditor teams={leagueState.teams} />
    </section>
  );
}
