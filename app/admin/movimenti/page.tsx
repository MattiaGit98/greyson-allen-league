import { requireActiveSeason } from "@/lib/active-season";
import { leagueMomentFromSeason } from "@/lib/league-moments";
import { draftChoiceBelongsToSeason, movementUndoWindowError } from "@/lib/league-movements";
import { conciseMovementDetail, movementOperationLabel, movementSearchFilter, normalizeMovementSearchQuery } from "@/lib/movement-display";
import { UndoMovementButton } from "./undo-movement-button";
import { MovementTextSearch } from "@/components/movement-text-search";

export default async function MovementAdminPage({ searchParams }: { searchParams: Promise<{ error?: string; reverted?: string; q?: string }> }) {
  const query = await searchParams;
  const searchQuery = normalizeMovementSearchQuery(query.q ?? "");
  const textFilter = movementSearchFilter(searchQuery);
  const { supabase, season } = await requireActiveSeason();
  const currentMoment = leagueMomentFromSeason(season);
  let movementRequest = supabase.from("league_movements").select("id,operation_type,summary,season_name,undo_before_moment,created_at,reverted_at");
  if (textFilter) movementRequest = movementRequest.or(textFilter);
  const [response, draftChoicesResponse] = await Promise.all([
    movementRequest.order("created_at", { ascending: false }).limit(100),
    supabase
      .from("league_movements")
      .select("id,season_name,after_history")
      .eq("operation_type", "scelta_draft")
      .is("reverted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1),
  ]);
  if (response.error) throw new Error(`Registro movimenti non disponibile: ${response.error.message}`);
  if (draftChoicesResponse.error) throw new Error(`Scelte del Draft non disponibili: ${draftChoicesResponse.error.message}`);
  const latestDraftChoiceId = (draftChoicesResponse.data ?? []).find((movement) => (
    draftChoiceBelongsToSeason(movement.season_name, movement.after_history, season.name)
  ))?.id ?? null;
  const movements = (response.data ?? []).map((movement) => {
    const legacyRookieDecision = !movement.season_name
      && (movement.operation_type === "team_option" || movement.operation_type === "rookie_extension");
    const reason = movement.reverted_at ? "Movimento già annullato" : legacyRookieDecision ? null : movementUndoWindowError({
      operationType: movement.operation_type,
      movementSeasonName: movement.season_name,
      undoBeforeMoment: movement.undo_before_moment,
      currentSeasonName: season.name,
      currentMoment,
      isLatestDraftChoice: movement.id === latestDraftChoiceId,
    });
    return { ...movement, reversible: !reason, reason };
  });
  return (
    <section className="section page-top admin-dashboard movement-admin-page">
      {query.reverted && <p className="notice success">Movimento annullato e stato precedente ripristinato.</p>}
      {query.error && <p className="notice error">Annullamento non riuscito: {query.error}</p>}
      <div className="movement-admin-search">
        <MovementTextSearch initialValue={searchQuery} path="/admin/movimenti" />
      </div>
      <div className="movement-admin-list">
        {movements.map((movement) => (
          <article className={movement.reverted_at ? "reverted" : ""} key={movement.id}>
            <div><span>{movementOperationLabel(movement.operation_type)}</span><strong>{conciseMovementDetail(movement.operation_type, movement.summary)}</strong>{movement.reason && <small>{movement.reason}</small>}{movement.reverted_at && <small>Movimento già annullato</small>}</div>
            <UndoMovementButton movementId={movement.id} summary={conciseMovementDetail(movement.operation_type, movement.summary)} disabled={!movement.reversible} />
          </article>
        ))}
        {!movements.length && <p className="data-empty">{searchQuery ? "Nessun movimento corrisponde alla ricerca." : "Nessun movimento registrato."}</p>}
      </div>
    </section>
  );
}
