import { requireActiveSeason } from "@/lib/active-season";
import { formatCalendarDate } from "@/lib/calendar-homepage";
import { generatedLeagueCalendar, normalizePhaseDates } from "@/lib/phase-calendar";

export default async function CalendarPage() {
  const activeSeason = await requireActiveSeason();
  const response = await activeSeason.supabase
    .from("calendar_events")
    .select("id,event_text,date_text,sort_order")
    .eq("season_id", activeSeason.season.id)
    .order("sort_order");
  if (response.error) throw new Error(`Calendario non disponibile: ${response.error.message}`);
  const calendarEvents = (response.data ?? []).map((event) => ({
    ...event,
    date_text: event.date_text ? `G ${event.date_text}` : event.date_text,
  }));
  const leagueCalendar = generatedLeagueCalendar(normalizePhaseDates(activeSeason.season.phase_dates)).map((event) => ({
    ...event,
    date: formatCalendarDate(event.date),
  }));

  return (
    <section className="section calendar-page">
      <CalendarTable title="Calendario della lega" valueLabel="Data" rows={leagueCalendar.map((event) => ({ key: event.key, event: event.event, value: event.date }))} empty="Nessuna data della lega inserita." />
      <CalendarTable title="Calendario competizioni" valueLabel="Giornata/e" rows={calendarEvents.map((event) => ({ key: event.id, event: event.event_text, value: event.date_text }))} empty="Nessun evento inserito." />
    </section>
  );
}

function CalendarTable({ title, valueLabel, rows, empty }: { title: string; valueLabel: string; rows: Array<{ key: string; event: string; value: string }>; empty: string }) {
  return (
    <section className="calendar-table-card">
      <h2>{title}</h2>
      <div className="calendar-list">
        <div className="calendar-list-head"><span>Evento</span><span>{valueLabel}</span></div>
        {rows.map((event) => <article className="calendar-row" key={event.key}><strong>{event.event}</strong><time>{event.value || "—"}</time></article>)}
        {!rows.length && <div className="movement-empty">{empty}</div>}
      </div>
    </section>
  );
}
