import { requireActiveSeason } from "@/lib/active-season";
import { calendarHomepageEventKey } from "@/lib/calendar-homepage";
import { loadEditableLeagueState } from "@/lib/league-state";
import { CalendarEditor } from "./calendar-editor";

export default async function CalendarAdminPage() {
  const activeSeason = await requireActiveSeason();
  const [response, leagueState] = await Promise.all([
    activeSeason.supabase
      .from("calendar_events")
      .select("id,event_text,date_text,sort_order")
      .eq("season_id", activeSeason.season.id)
      .order("sort_order"),
    loadEditableLeagueState(),
  ]);
  if (response.error) throw new Error(`Calendario non disponibile: ${response.error.message}`);
  const initialRows = (response.data ?? []).map((row) => ({
      key: row.id,
      event: row.event_text,
      date: row.date_text,
      showOnHomepage: (leagueState.calendarHomepageEventKeys ?? []).includes(calendarHomepageEventKey({ event: row.event_text, date: row.date_text })),
    }));

  return (
    <section className="section page-top admin-dashboard">
      <CalendarEditor initialRows={initialRows} />
    </section>
  );
}
