import { requireActiveSeason } from "@/lib/active-season";

export default async function CalendarPage() {
  const activeSeason = await requireActiveSeason();
  const response = await activeSeason.supabase
    .from("calendar_events")
    .select("id,event_text,date_text,sort_order")
    .eq("season_id", activeSeason.season.id)
    .order("sort_order");
  if (response.error) throw new Error(`Calendario non disponibile: ${response.error.message}`);
  const calendarEvents = response.data ?? [];

  return (
    <section className="section calendar-page">
      <div className="calendar-list">
        <div className="calendar-list-head">
          <span>Evento</span>
          <span>Data</span>
        </div>
        {calendarEvents.map((event) => (
          <article className="calendar-row" key={event.id}>
            <strong>{event.event_text}</strong>
            <time>{event.date_text || "—"}</time>
          </article>
        ))}
        {!calendarEvents.length && <div className="movement-empty">Nessun evento inserito.</div>}
      </div>
    </section>
  );
}
