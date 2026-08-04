import { createSupabaseServerClient } from "@/lib/supabase/server";
import { conciseMovementDetail, movementOperationLabel } from "@/lib/movement-display";

const movementDateFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function TransactionsPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase non configurato: registro movimenti non disponibile.");
  const response = await supabase.from("league_movement_feed").select("id,operation_type,summary,reverted,created_at").order("created_at", { ascending: false }).limit(100);
  if (response.error) throw new Error(`Registro movimenti non disponibile: ${response.error.message}`);
  const movements = (response.data ?? []).filter((movement) => !movement.reverted);
  return (
    <section className="section movements-page"><div className="movement-list">
      <div className="movement-list-head"><span>Data e ora</span><span>Operazione</span><span>Dettaglio</span></div>
      {movements.map((movement) => {
        const operationType = String(movement.operation_type);
        const summary = conciseMovementDetail(operationType, String(movement.summary));
        return (
          <div className="movement-list-row" key={movement.id}>
            <time dateTime={movement.created_at}>{formatMovementDate(movement.created_at)}</time>
            <strong>{movementOperationLabel(operationType)}</strong>
            <span className="movement-detail">{summary}</span>
          </div>
        );
      })}
      {!movements.length && <div className="movement-empty">Nessun movimento registrato</div>}
    </div></section>
  );
}

function formatMovementDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : movementDateFormatter.format(date);
}
