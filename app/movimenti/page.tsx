import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function TransactionsPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase non configurato: registro movimenti non disponibile.");
  const response = await supabase.from("league_movement_feed").select("id,operation_type,summary,reverted,created_at").order("created_at", { ascending: false }).limit(100);
  if (response.error) throw new Error(`Registro movimenti non disponibile: ${response.error.message}`);
  const movements = (response.data ?? []).filter((movement) => !movement.reverted);
  return (
    <section className="section movements-page"><div className="movement-list">
      <div className="movement-list-head"><span>Operazione</span><span>Dettaglio</span></div>
      {movements.map((movement) => <div className="movement-list-row" key={movement.id}><strong>{String(movement.operation_type).replaceAll("_", " ")}</strong><span>{movement.summary}</span></div>)}
      {!movements.length && <div className="movement-empty">Nessun movimento registrato</div>}
    </div></section>
  );
}
