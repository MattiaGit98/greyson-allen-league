import { PlayoffTeamOptionForm, TeamOptionForm } from "@/app/admin/operation-forms";
import { getAdminOperationContext } from "@/lib/admin-operation-data";
import { operationWindows } from "@/lib/league-moments";

export default async function TeamOptionPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string; playoff_updated?: string }> }) {
  const query = await searchParams;
  const context = await getAdminOperationContext();
  const ordinaryOpen = operationWindows.teamOption(context.leagueMoment);
  const playoffOpen = operationWindows.playoffTeamOption(context.leagueMoment);
  return <section className="section page-top admin-dashboard">
    {query.updated && <p className="notice success">Team option aggiornate: {query.updated}.</p>}
    {query.playoff_updated && <p className="notice success">T.O. esercitate per utilizzo nei playoff: {query.playoff_updated}.</p>}
    {query.error && <p className="notice error">Operazione non riuscita: {query.error}</p>}
    {ordinaryOpen && <TeamOptionForm {...context} />}
    {playoffOpen && <PlayoffTeamOptionForm {...context} />}
    {!ordinaryOpen && !playoffOpen && <p className="notice"><strong>Pannello Team option chiuso.</strong> Riaprirà dopo il termine della free agency per registrare le T.O. dei giocatori utilizzati nei playoff.</p>}
  </section>;
}
