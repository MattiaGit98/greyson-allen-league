"use client";

import { useState } from "react";
import { calendarEventLabel, datedLeagueTransitions, type LeagueCalendarEventKey, type PhaseDateMap } from "@/lib/phase-calendar";
import { saveLeaguePhaseDates } from "./actions";

export function PhaseCalendarEditor({ initialDates }: { initialDates: PhaseDateMap }) {
  const [dates, setDates] = useState<PhaseDateMap>(initialDates);
  const rows = datedLeagueTransitions.filter((phase) => phase !== "auction_completed");

  function update(phase: LeagueCalendarEventKey, date: string) {
    setDates((current) => ({ ...current, [phase]: date, ...(phase === "auction_start" ? { auction_completed: date } : {}) }));
  }

  return (
    <form action={saveLeaguePhaseDates} className="calendar-editor-form phase-date-editor">
      <input type="hidden" name="phase_dates_json" value={JSON.stringify(dates)} />
      <div className="calendar-editor-table">
        <div className="calendar-editor-head"><span>Fase</span><span>Data</span></div>
        {rows.map((phase) => (
          <div className="calendar-editor-row" key={phase}>
            <strong>{calendarEventLabel(phase)}</strong>
            <label><span>Data</span><input type="date" value={dates[phase] ?? ""} onChange={(event) => update(phase, event.target.value)} /></label>
          </div>
        ))}
      </div>
      <button className="button primary calendar-save" type="submit">Salva date</button>
    </form>
  );
}
