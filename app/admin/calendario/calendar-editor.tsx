"use client";

import { useActionState, useState } from "react";
import { isHomepageCalendarDate } from "@/lib/calendar-homepage";
import { saveCalendar, type CalendarSaveState } from "./actions";

type CalendarRow = { key: string; event: string; date: string; showOnHomepage: boolean };
const initialState: CalendarSaveState = {};

export function CalendarEditor({ initialRows }: { initialRows: CalendarRow[] }) {
  const [rows, setRows] = useState<CalendarRow[]>(initialRows);
  const [state, action, pending] = useActionState(saveCalendar, initialState);

  function updateRow(key: string, field: "event" | "date", value: string) {
    setRows((current) => current.map((row) => (
      row.key === key ? { ...row, [field]: value } : row
    )));
  }

  function addRow() {
    setRows((current) => [...current, { key: crypto.randomUUID(), event: "", date: "", showOnHomepage: false }]);
  }

  function setHomepageVisibility(key: string, showOnHomepage: boolean) {
    setRows((current) => current.map((row) => (
      row.key === key ? { ...row, showOnHomepage, date: showOnHomepage && !isHomepageCalendarDate(row.date) ? "" : row.date } : row
    )));
  }

  function moveRow(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= rows.length) return;
    setRows((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  }

  return (
    <form action={action} className="calendar-editor-form">
      <input
        type="hidden"
        name="calendar_json"
        value={JSON.stringify(rows.map(({ event, date, showOnHomepage }) => ({ event, date, showOnHomepage })))}
      />
      <div className="calendar-editor-table">
        <div className="calendar-editor-head">
          <span>Evento</span><span>Data</span><span>Home</span><span>Ordine</span><span></span>
        </div>
        {rows.map((row, index) => (
          <div className="calendar-editor-row" key={row.key}>
            <label>
              <span>Evento</span>
              <input value={row.event} onChange={(event) => updateRow(row.key, "event", event.target.value)} placeholder="Scrivi l’evento" />
            </label>
            <label>
              <span>Data</span>
              <input type={row.showOnHomepage ? "date" : "text"} value={row.date} onChange={(event) => updateRow(row.key, "date", event.target.value)} placeholder={row.showOnHomepage ? undefined : "Scrivi la data"} />
            </label>
            <label className="calendar-home-toggle">
              <span>Mostra in homepage</span>
              <input type="checkbox" checked={row.showOnHomepage} onChange={(event) => setHomepageVisibility(row.key, event.target.checked)} />
            </label>
            <div className="calendar-row-order">
              <button type="button" onClick={() => moveRow(index, -1)} disabled={index === 0} aria-label="Sposta in alto">↑</button>
              <button type="button" onClick={() => moveRow(index, 1)} disabled={index === rows.length - 1} aria-label="Sposta in basso">↓</button>
            </div>
            <button className="calendar-row-remove" type="button" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))} aria-label="Elimina riga">×</button>
          </div>
        ))}
        {!rows.length && <p className="calendar-editor-empty">Nessuna riga inserita.</p>}
      </div>
      <button className="calendar-add-row" type="button" onClick={addRow}>+ Aggiungi riga</button>
      {state.error && <p className="notice error">{state.error}</p>}
      {state.message && <p className="notice success">{state.message}</p>}
      <button className="button primary calendar-save" type="submit" disabled={pending}>
        {pending ? "Salvataggio…" : "Salva calendario"}
      </button>
    </form>
  );
}
