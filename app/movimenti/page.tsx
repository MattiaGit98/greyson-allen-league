import { createSupabaseServerClient } from "@/lib/supabase/server";

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
      <div className="movement-list-head"><span>Operazione</span><span>Dettaglio</span><span>Data e ora</span></div>
      {movements.map((movement) => {
        const summary = String(movement.summary);
        return (
          <div className="movement-list-row" key={movement.id}>
            <strong>{String(movement.operation_type).replaceAll("_", " ")}</strong>
            <span className="movement-detail" title={summary}>{compactMovementDetail(summary)}</span>
            <time dateTime={movement.created_at}>{formatMovementDate(movement.created_at)}</time>
          </div>
        );
      })}
      {!movements.length && <div className="movement-empty">Nessun movimento registrato</div>}
    </div></section>
  );
}

function compactMovementDetail(value: string) {
  return value
    .replace(/\s*;\s*/g, " · ")
    .replace(/\s*·\s*/g, " · ")
    .replace(/\bcrediti\b/gi, "cr.")
    .replace(/\bcontratto\b/gi, "contr.")
    .replace(/\bscadenza\b/gi, "scad.")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMovementDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : movementDateFormatter.format(date);
}
