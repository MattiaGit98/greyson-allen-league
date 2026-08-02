import { buildMovementReversal } from "@/lib/league-movements";
import { loadEditableLeagueState, normalizeState } from "@/lib/league-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UndoMovementButton } from "./undo-movement-button";

export default async function MovementAdminPage({ searchParams }: { searchParams: Promise<{ error?: string; reverted?: string }> }) {
  const query = await searchParams;
  const [supabase, current] = await Promise.all([createSupabaseServerClient(), loadEditableLeagueState()]);
  if (!supabase) throw new Error("Supabase non configurato: registro movimenti non disponibile.");
  const response = await supabase.from("league_movements").select("id,operation_type,summary,before_state,after_state,created_at,reverted_at").order("created_at", { ascending: false }).limit(100);
  if (response.error) throw new Error(`Registro movimenti non disponibile: ${response.error.message}`);
  const movements = (response.data ?? []).map((movement) => {
    let reversible = !movement.reverted_at;
    let reason = "";
    if (reversible) {
      try {
        buildMovementReversal(current, normalizeState(movement.before_state), normalizeState(movement.after_state));
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
