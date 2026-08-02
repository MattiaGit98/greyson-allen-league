"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type { PlayerListEntry } from "@/lib/league-types";
import { savePlayerList, type PlayerListSaveState } from "./actions";

type EditablePlayer = PlayerListEntry & { rowId: string };

const initialSaveState: PlayerListSaveState = {};

export function PlayerListEditor({
  initialPlayers,
  initialStatus,
}: {
  initialPlayers: PlayerListEntry[];
  initialStatus: "offseason" | "published";
}) {
  const [rows, setRows] = useState<EditablePlayer[]>(() => initialPlayers.map((player, index) => ({
    ...player,
    rowId: `saved-${index}`,
  })));
  const [status, setStatus] = useState(initialStatus);
  const [query, setQuery] = useState("");
  const [saveState, saveAction, pending] = useActionState(savePlayerList, initialSaveState);
  const provisionalList = initialStatus === "offseason";
  useEffect(() => {
    if (!saveState.savedRevision) return;
    setRows((current) => current.map((row, index) => (
      row.rowId.startsWith("new-") ? { ...row, rowId: `saved-${saveState.savedRevision}-${index}` } : row
    )));
  }, [saveState.savedRevision]);
  const visibleRows = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("it-IT");
    return rows.filter((row) => !search || row.name.toLocaleLowerCase("it-IT").includes(search));
  }, [query, rows]);

  function updateRow(rowId: string, patch: Partial<PlayerListEntry>) {
    setRows((current) => current.map((row) => row.rowId === rowId ? { ...row, ...patch } : row));
  }

  function addRow() {
    const rowId = `new-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setRows((current) => [...current, {
      rowId,
      name: "",
      role: "G",
      realTeam: "",
      rookie: false,
      under23: false,
    }]);
    setQuery("");
  }

  function moveRow(rowId: string, distance: -1 | 1) {
    setRows((current) => {
      const index = current.findIndex((row) => row.rowId === rowId);
      const destination = index + distance;
      if (index < 0 || destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  }

  const payload = rows.map(({ rowId: _rowId, ...player }) => player);

  return (
    <form action={saveAction} className="player-list-editor">
      <input type="hidden" name="players_json" value={JSON.stringify(payload)} />
      <input type="hidden" name="list_status" value={status} />

      <div className="player-list-editor-toolbar">
        <label className="player-list-editor-search">
          <span>Cerca giocatore</span>
          <div className="player-list-search-control">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Scrivi il nome…" />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Cancella ricerca">×</button>
            )}
          </div>
        </label>
        <label className="player-list-status-field">
          <span>Tipo di listone</span>
          <select value={status} disabled={provisionalList} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="offseason">Provvisorio offseason</option>
            <option value="published">Ufficiale pubblicato</option>
          </select>
        </label>
        {!provisionalList && <button className="button secondary" type="button" onClick={addRow}>Aggiungi giocatore</button>}
      </div>

      {provisionalList && <p className="notice">Listone provvisorio: è modificabile soltanto il ruolo.</p>}
      {status === "published" && (
        <p className="notice">Il salvataggio come listone ufficiale attiva i controlli sui roster e sui minimi di ruolo.</p>
      )}
      {saveState.message && <p className="notice success">{saveState.message}</p>}
      {saveState.error && <p className="notice error">Salvataggio non riuscito: {saveState.error}</p>}

      <div className="player-list-edit-table">
        <div className="player-list-edit-head">
          <span>#</span><span>Giocatore</span><span>Ruolo</span><span>Squadra reale</span><span>Rookie</span><span>U23</span><span></span>
        </div>
        {visibleRows.map((row) => {
          const absoluteIndex = rows.findIndex((item) => item.rowId === row.rowId);
          const isNew = row.rowId.startsWith("new-");
          return (
            <div className="player-list-edit-row" key={row.rowId}>
              <span className="player-list-edit-order">{absoluteIndex + 1}</span>
              {isNew
                ? <input className="player-list-edit-name" aria-label={`Nome riga ${absoluteIndex + 1}`} value={row.name} onChange={(event) => updateRow(row.rowId, { name: event.target.value })} autoFocus />
                : <strong className="player-list-edit-name" title={row.name}>{row.name}</strong>}
              <select aria-label={`Ruolo di ${row.name || `riga ${absoluteIndex + 1}`}`} value={row.role} onChange={(event) => updateRow(row.rowId, { role: event.target.value as PlayerListEntry["role"] })}>
                <option value="G">G</option><option value="A">A</option><option value="C">C</option><option value="X">X</option>
              </select>
              <input aria-label={`Squadra reale di ${row.name || `riga ${absoluteIndex + 1}`}`} value={row.realTeam} disabled={provisionalList} onChange={(event) => updateRow(row.rowId, { realTeam: event.target.value })} />
              <label className="compact-check"><input type="checkbox" checked={row.rookie} disabled={provisionalList} onChange={(event) => updateRow(row.rowId, { rookie: event.target.checked })} /><span>R</span></label>
              <label className="compact-check"><input type="checkbox" checked={row.under23} disabled={provisionalList} onChange={(event) => updateRow(row.rowId, { under23: event.target.checked })} /><span>U23</span></label>
              <div className="player-list-edit-actions">
                {!provisionalList && <>
                  <button type="button" onClick={() => moveRow(row.rowId, -1)} disabled={absoluteIndex === 0} aria-label={`Sposta ${row.name} su`}>↑</button>
                  <button type="button" onClick={() => moveRow(row.rowId, 1)} disabled={absoluteIndex === rows.length - 1} aria-label={`Sposta ${row.name} giù`}>↓</button>
                  <button className="danger" type="button" onClick={() => setRows((current) => current.filter((item) => item.rowId !== row.rowId))}>Rimuovi</button>
                </>}
              </div>
            </div>
          );
        })}
        {!visibleRows.length && <p className="data-empty">Nessuna riga visibile.</p>}
      </div>

      <div className="player-list-editor-footer">
        <span>{rows.length} giocatori</span>
        <button className="button primary" type="submit" disabled={pending}>{pending ? "Salvataggio…" : "Salva listone"}</button>
      </div>
    </form>
  );
}
