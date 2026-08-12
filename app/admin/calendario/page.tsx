import { requireActiveSeason } from "@/lib/active-season";
import { normalizePhaseDates } from "@/lib/phase-calendar";
import { CalendarEditor } from "./calendar-editor";
import { PhaseCalendarEditor } from "../impostazioni/phase-calendar-editor";

export default async function CalendarAdminPage({ searchParams }: { searchParams: Promise<{ dates?: string }> }) {
  const query = await searchParams;
  const activeSeason = await requireActiveSeason();
  const response = await activeSeason.supabase
    .from("calendar_events")
    .select("id,event_text,date_text,sort_order")
    .eq("season_id", activeSeason.season.id)
    .order("sort_order");
  if (response.error) throw new Error(`Calendario non disponibile: ${response.error.message}`);
  const initialRows = (response.data ?? []).map((row) => ({
      key: row.id,
      event: row.event_text,
      date: row.date_text,
    }));

  return (
    <section className="section page-top admin-dashboard">
      {query.dates && <p className="notice success">Date delle fasi salvate.</p>}
      <section className="calendar-admin-section">
        <header><span>Calendario della lega</span><strong>Date delle fasi</strong></header>
        <PhaseCalendarEditor initialDates={normalizePhaseDates(activeSeason.season.phase_dates)} />
      </section>
      <section className="calendar-admin-section">
        <header><span>Calendario competizioni</span><strong>Giornate delle competizioni</strong></header>
        <CalendarEditor initialRows={initialRows} />
      </section>
    </section>
  );
}
