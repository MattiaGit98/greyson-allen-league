import { loadEditableLeagueState } from "@/lib/league-state";
import { requireActiveSeason } from "@/lib/active-season";
import { hasReachedMoment, leagueMomentFromSeason } from "@/lib/league-moments";
import { PlayerListEditor } from "./player-list-editor";
import { PlayerListImport } from "./list-import-reconciliation";

export default async function PlayerListAdminPage({ searchParams }: { searchParams: Promise<{ error?: string; imported?: string; aligned?: string }> }) {
  const query = await searchParams;
  const [state, activeSeason] = await Promise.all([
    loadEditableLeagueState(),
    requireActiveSeason(),
  ]);
  const eligibilityEditable = !hasReachedMoment(leagueMomentFromSeason(activeSeason.season), "contract_delivery");

  return (
    <section className="section page-top admin-settings player-list-admin-page">
      <div className="player-list-admin-tools">
        <a className="button secondary" href="/admin/listone/modello">Scarica modello Excel</a>
        <PlayerListImport />
      </div>
      {query.imported && <p className="notice success">Listone ufficiale importato: {query.imported} giocatori · {query.aligned ?? 0} nomi allineati.</p>}
      {query.error && <p className="notice error">Importazione non riuscita: {query.error}</p>}
      <PlayerListEditor
        initialPlayers={state.playerList}
        initialStatus={state.playerListStatus}
        eligibilityEditable={eligibilityEditable}
      />
    </section>
  );
}
