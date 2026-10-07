import { PlayoffTeamOptionForm, TeamOptionForm } from "@/app/admin/operation-forms";
import { getAdminOperationContext } from "@/lib/admin-operation-data";
import { operationWindows } from "@/lib/league-moments";

export default async function TeamOptionPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string; playoff_updated?: string }> }) {
  const query = await searchParams;
  const context = await getAdminOperationContext();
  const ordinaryOpen = operationWindows.teamOption(context.leagueMoment);
  const playoffOpen = context.playoffTeamOptionOpen;
  return <section className="section page-top admin-dashboard">
    {query.updated && <p className="notice success">Contratti da rookie aggiornati: {query.updated}.</p>}
    {query.playoff_updated && <p className="notice success">Utilizzi nei playoff registrati: {query.playoff_updated}.</p>}
    {query.error && <p className="notice error">Operazione non riuscita: {query.error}</p>}
    {ordinaryOpen && <TeamOptionForm {...context} />}
    {playoffOpen && <PlayoffTeamOptionForm {...context} />}
    {!ordinaryOpen && !playoffOpen && <p className="notice"><strong>Pannello Contratti da rookie chiuso.</strong> L'utilizzo dei giocatori in G-League nei playoff si registra dall'inizio della postseason fino alla riapertura della free agency.</p>}
  </section>;
}
