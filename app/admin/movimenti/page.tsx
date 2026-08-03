import { requireActiveSeason } from "@/lib/active-season";
import { leagueMomentFromSeason } from "@/lib/league-moments";
import { buildMovementReversal, movementReversalSlotErrors, movementUndoMetadataFromState, movementUndoWindowError } from "@/lib/league-movements";
import { loadEditableLeagueState, normalizeState } from "@/lib/league-state";
import { UndoMovementButton } from "./undo-movement-button";

export default async function MovementAdminPage({ searchParams }: { searchParams: Promise<{ error?: string; reverted?: string }> }) {
  const query = await searchParams;
  const [{ supabase, season }, current] = await Promise.all([requireActiveSeason(), loadEditableLeagueState()]);
  const currentMoment = leagueMomentFromSeason(season);
  const response = await supabase.from("league_movements").select("id,operation_type,summary,before_state,after_state,season_name,undo_before_moment,created_at,reverted_at").order("created_at", { ascending: false }).limit(100);
  if (response.error) throw new Error(`Registro movimenti non disponibile: ${response.error.message}`);
  const movements = (response.data ?? []).map((movement) => {
    let reversible = !movement.reverted_at;
    let reason = "";
    if (reversible) {
      const snapshotMetadata = movementUndoMetadataFromState(movement.before_state);
      const windowError = movementUndoWindowError({
        operationType: movement.operation_type,
        movementSeasonName: movement.season_name ?? snapshotMetadata.seasonName,
        undoBeforeMoment: movement.undo_before_moment ?? snapshotMetadata.undoBeforeMoment,
        currentSeasonName: season.name,
        currentMoment,
      });
      if (windowError) {
        reversible = false;
        reason = windowError;
      }
    }
    if (reversible) {
      try {
        const restored = buildMovementReversal(
          current,
          normalizeState(movement.before_state),
          normalizeState(movement.after_state),
        );
        const slotErrors = movementReversalSlotErrors(current, restored);
        if (slotErrors.length) {
          reversible = false;
          reason = `${slotErrors.join(" ")} L'annullamento ricreerebbe un conflitto di slot.`;
        }
      } catch (error) {
        reversible = false;
        reason = error instanceof Error ? error.message : "Non annullabile.";
      }
    }
    return { ...movement, reversible, reason };
  });
  return (
    <section className="section page-top admin-dashboard movement-admin-page">
      {query.reverted && <p className="notice success">Movimento annullato e stato precedente ripristinato.</p>}
      {query.error && <p className="notice error">Annullamento non riuscito: {query.error}</p>}
      <div className="movement-admin-list">
        {movements.map((movement) => (
          <article className={movement.reverted_at ? "reverted" : ""} key={movement.id}>
            <div><span>{movement.operation_type.replaceAll("_", " ")}</span><strong>{movement.summary}</strong>{movement.reason && <small>{movement.reason}</small>}{movement.reverted_at && <small>Movimento già annullato</small>}</div>
            <UndoMovementButton movementId={movement.id} summary={movement.summary} disabled={!movement.reversible} />
          </article>
        ))}
        {!movements.length && <p className="data-empty">Nessun movimento annullabile registrato.</p>}
      </div>
    </section>
  );
}
