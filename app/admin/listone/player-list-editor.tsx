"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { PlayerListEntry } from "@/lib/league-types";
import { nbaTeams } from "@/data/nba-teams";
import { movePlayerToRoleBoundary, orderPlayerListByRole } from "@/lib/player-list-order";
import { savePlayerList, updatePlayerListEntry, type PlayerListEntrySaveState, type PlayerListSaveState } from "./actions";

type EditablePlayer = PlayerListEntry & { rowId: string };

const initialSaveState: PlayerListSaveState = {};
const initialEntrySaveState: PlayerListEntrySaveState = {};

export function PlayerListEditor({
  initialPlayers,
  initialStatus,
  eligibilityEditable,
  showRealTeam,
  showEligibilityBadges,
}: {
  initialPlayers: PlayerListEntry[];
  initialStatus: "offseason" | "published";
  eligibilityEditable: boolean;
  showRealTeam: boolean;
  showEligibilityBadges: boolean;
}) {
  const [rows, setRows] = useState<EditablePlayer[]>(() => initialPlayers.map((player, index) => ({
    ...player,
    rowId: `saved-${index}`,
  })));
  const [query, setQuery] = useState("");
  const [saveState, saveAction, pending] = useActionState(savePlayerList, initialSaveState);
  const [entrySaveState, entrySaveAction, entryPending] = useActionState(updatePlayerListEntry, initialEntrySaveState);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<PlayerListEntry | null>(null);
  const [editSubmitted, setEditSubmitted] = useState(false);
  const [editSuccess, setEditSuccess] = useState("");
  const handledEntryRevision = useRef<number | undefined>(undefined);
  const provisionalList = initialStatus === "offseason";
  const eligibilityDisabled = provisionalList || !eligibilityEditable;
  useEffect(() => {
    if (!saveState.savedRevision) return;
    setRows((current) => orderPlayerListByRole(current.map((row, index) => (
      row.rowId.startsWith("new-") ? { ...row, rowId: `saved-${saveState.savedRevision}-${index}` } : row
    ))));
  }, [saveState.savedRevision]);
  useEffect(() => {
    if (!editSubmitted || !entrySaveState.savedRevision || entrySaveState.savedRevision === handledEntryRevision.current || !entrySaveState.savedPlayer || !editingRowId) return;
    handledEntryRevision.current = entrySaveState.savedRevision;
    setRows((current) => {
      const playerIndex = current.findIndex((row) => row.rowId === editingRowId);
      if (playerIndex < 0) return current;
      const roleCategoryChanged = (current[playerIndex].role === "X") !== (entrySaveState.savedPlayer!.role === "X");
      const updated = current.map((row, index) => index === playerIndex ? { ...row, ...entrySaveState.savedPlayer } : row);
      return roleCategoryChanged ? movePlayerToRoleBoundary(updated, playerIndex) : updated;
    });
    setEditSuccess(entrySaveState.message ?? `${entrySaveState.savedPlayer.name} aggiornato.`);
    setEditingRowId(null);
    setEditingPlayer(null);
    setEditSubmitted(false);
  }, [editSubmitted, editingRowId, entrySaveState.message, entrySaveState.savedPlayer, entrySaveState.savedRevision]);
  const visibleRows = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("it-IT");
    return rows.filter((row) => !search || row.name.toLocaleLowerCase("it-IT").includes(search));
  }, [query, rows]);

  function updateRow(rowId: string, patch: Partial<PlayerListEntry>) {
    setRows((current) => {
      const playerIndex = current.findIndex((row) => row.rowId === rowId);
      if (playerIndex < 0) return current;
      const roleCategoryChanged = patch.role !== undefined
        && (current[playerIndex].role === "X") !== (patch.role === "X");
      const updated = current.map((row, index) => index === playerIndex ? { ...row, ...patch } : row);
      return roleCategoryChanged ? movePlayerToRoleBoundary(updated, playerIndex) : updated;
    });
  }

  function addRow() {
    const rowId = `new-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setRows((current) => [...current, {
      rowId,
      name: "",
      role: "X",
      realTeam: "FA",
      rookie: false,
      under23: false,
    }]);
    setQuery("");
  }

  function openEditor(row: EditablePlayer) {
    setEditingRowId(row.rowId);
    setEditingPlayer({ name: row.name, role: row.role, realTeam: row.realTeam, rookie: row.rookie, under23: row.under23 });
    setEditSubmitted(false);
    setEditSuccess("");
  }

  const payload = rows.map(({ rowId: _rowId, ...player }) => player);
  const newPlayerNames = rows.filter((row) => row.rowId.startsWith("new-")).map((row) => row.name.trim());
  const hasIncompleteNewPlayer = rows.some((row) => row.rowId.startsWith("new-") && (!row.name.trim() || !row.realTeam));
  const editingRealTeamIsStandard = Boolean(editingPlayer && (
    editingPlayer.realTeam === "FA" || nbaTeams.some((team) => team.code === editingPlayer.realTeam)
  ));

  return (
    <>
    <form action={saveAction} className="player-list-editor">
      <input type="hidden" name="players_json" value={JSON.stringify(payload)} />
      <input type="hidden" name="new_player_names_json" value={JSON.stringify(newPlayerNames)} />
      <input type="hidden" name="list_status" value={initialStatus} />

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
        {!provisionalList && <button className="button secondary" type="button" onClick={addRow}>Aggiungi giocatore</button>}
      </div>

      {provisionalList && <p className="notice">Listone provvisorio: non è modificabile fino alla pubblicazione del listone ufficiale.</p>}
      {editSuccess && <p className="notice success">{editSuccess}</p>}
      {saveState.message && <p className="notice success">{saveState.message}</p>}
      {saveState.error && <p className="notice error">Salvataggio non riuscito: {saveState.error}</p>}

      <div className={`player-list-edit-table${showRealTeam ? "" : " without-real-team"}${showEligibilityBadges ? "" : " without-eligibility"}`}>
        <div className="player-list-edit-head">
          <span>#</span><span>Giocatore</span><span>Ruolo</span>{showRealTeam && <span>Squadra NBA</span>}{showEligibilityBadges && <><span>Rookie</span><span>U23</span></>}<span className="player-list-edit-action-head"></span>
        </div>
        {visibleRows.map((row) => {
          const absoluteIndex = rows.findIndex((item) => item.rowId === row.rowId);
          const isNew = row.rowId.startsWith("new-");
          return (
            <div className={`player-list-edit-row${showRealTeam ? "" : " without-real-team"}${showEligibilityBadges ? "" : " without-eligibility"}${isNew ? " is-new" : ""}`} key={row.rowId}>
              <span className="player-list-edit-order">{absoluteIndex + 1}</span>
              <span className="player-list-edit-identity">
                {isNew
                  ? <input className="player-list-edit-name" aria-label={`Nome riga ${absoluteIndex + 1}`} value={row.name} onChange={(event) => updateRow(row.rowId, { name: event.target.value })} autoFocus />
                  : <strong className="player-list-edit-name">{row.name}</strong>}
                {!isNew && showEligibilityBadges && <span className="player-list-edit-mobile-eligibility" aria-hidden="true">
                  {row.rookie && <small className="player-flag player-flag-rookie">R</small>}
                  {row.under23 && <small className="player-flag player-flag-u23">U23</small>}
                </span>}
              </span>
              {isNew ? (
                <select className="player-list-edit-role-field" aria-label={`Ruolo di ${row.name || `riga ${absoluteIndex + 1}`}`} value={row.role} onChange={(event) => updateRow(row.rowId, { role: event.target.value as PlayerListEntry["role"] })}>
                  <option value="G">G</option><option value="A">A</option><option value="C">C</option><option value="X">X</option>
                </select>
              ) : <span className="player-list-edit-static"><i className={`mini-role mini-role-${row.role.toLowerCase()}`}>{row.role}</i></span>}
              {showRealTeam && (isNew ? (
                <select className="player-list-edit-real-team-field" aria-label={`Squadra NBA di ${row.name || `riga ${absoluteIndex + 1}`}`} value={row.realTeam} required onChange={(event) => updateRow(row.rowId, { realTeam: event.target.value })}>
                  <option value="">Seleziona</option>
                  <option value="FA">Nessuna squadra NBA</option>
                  {nbaTeams.map((team) => <option value={team.code} key={team.code}>{team.code} · {team.name}</option>)}
                </select>
              ) : <strong className="player-list-edit-real-team">{row.realTeam || "—"}</strong>)}
              {showEligibilityBadges && (isNew ? <label className="compact-check player-list-edit-rookie">
                <input
                  type="checkbox"
                  checked={row.rookie}
                  disabled={eligibilityDisabled}
                  onChange={(event) => updateRow(row.rowId, {
                    rookie: event.target.checked,
                    under23: event.target.checked ? false : row.under23,
                  })}
                />
                <span>Rookie</span>
              </label> : <span className={`player-list-edit-boolean player-list-edit-rookie${row.rookie ? " active" : ""}`}><small>Rookie</small>{row.rookie ? "✓" : "—"}</span>)}
              {showEligibilityBadges && (isNew ? <label className="compact-check player-list-edit-under23">
                <input
                  type="checkbox"
                  checked={row.under23}
                  disabled={eligibilityDisabled}
                  onChange={(event) => updateRow(row.rowId, {
                    under23: event.target.checked,
                    rookie: event.target.checked ? false : row.rookie,
                  })}
                />
                <span>U23</span>
              </label> : <span className={`player-list-edit-boolean player-list-edit-under23${row.under23 ? " active" : ""}`}><small>U23</small>{row.under23 ? "✓" : "—"}</span>)}
              <div className="player-list-edit-actions">
                {!provisionalList && (isNew
                  ? <button type="button" onClick={() => setRows((current) => current.filter((item) => item.rowId !== row.rowId))}>Annulla</button>
                  : <button type="button" onClick={() => openEditor(row)}>Modifica</button>)}
              </div>
            </div>
          );
        })}
        {!visibleRows.length && <p className="data-empty">Nessuna riga visibile.</p>}
      </div>

      <div className="player-list-editor-footer">
        <span>{rows.length} giocatori</span>
        {!provisionalList && newPlayerNames.length > 0 && <button className="button primary" type="submit" disabled={pending || hasIncompleteNewPlayer}>{pending ? "Salvataggio…" : "Salva nuovi giocatori"}</button>}
      </div>
    </form>
    {editingPlayer && editingRowId && (
      <div className="auction-modal-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget && !entryPending) {
          setEditingRowId(null);
          setEditingPlayer(null);
          setEditSubmitted(false);
        }
      }}>
        <form className="auction-modal player-list-entry-modal" action={entrySaveAction} onSubmit={() => setEditSubmitted(true)} role="dialog" aria-modal="true" aria-label={`Modifica ${editingPlayer.name}`}>
          <input type="hidden" name="original_name" value={editingPlayer.name} />
          <input type="hidden" name="player_json" value={JSON.stringify(editingPlayer)} />
          <header className="auction-modal-header">
            <div><span>Modifica giocatore</span><strong>{editingPlayer.name}</strong></div>
          </header>
          <div className="auction-modal-body player-list-entry-modal-fields">
            <label><span>Ruolo</span><select value={editingPlayer.role} onChange={(event) => setEditingPlayer((current) => current ? { ...current, role: event.target.value as PlayerListEntry["role"] } : current)}><option value="G">G</option><option value="A">A</option><option value="C">C</option><option value="X">X</option></select></label>
            {showRealTeam && <label><span>Squadra NBA</span><select value={editingPlayer.realTeam} onChange={(event) => setEditingPlayer((current) => current ? { ...current, realTeam: event.target.value } : current)}>{!editingRealTeamIsStandard && <option value={editingPlayer.realTeam}>{editingPlayer.realTeam || "Dato attuale non indicato"}</option>}<option value="FA">Nessuna squadra NBA</option>{nbaTeams.map((team) => <option value={team.code} key={team.code}>{team.code} · {team.name}</option>)}</select></label>}
            <fieldset>
              <legend>Categoria</legend>
              <label className="compact-check"><input type="checkbox" checked={editingPlayer.rookie} disabled={eligibilityDisabled} onChange={(event) => setEditingPlayer((current) => current ? { ...current, rookie: event.target.checked, under23: event.target.checked ? false : current.under23 } : current)} /><span>Rookie</span></label>
              <label className="compact-check"><input type="checkbox" checked={editingPlayer.under23} disabled={eligibilityDisabled} onChange={(event) => setEditingPlayer((current) => current ? { ...current, under23: event.target.checked, rookie: event.target.checked ? false : current.rookie } : current)} /><span>U23</span></label>
            </fieldset>
            {editSubmitted && entrySaveState.error && <p className="validation error">Salvataggio non riuscito: {entrySaveState.error}</p>}
          </div>
          <footer className="auction-modal-actions">
            <button className="button secondary" type="button" disabled={entryPending} onClick={() => { setEditingRowId(null); setEditingPlayer(null); setEditSubmitted(false); }}>Annulla</button>
            <button className="button primary" type="submit" disabled={entryPending}>{entryPending ? "Salvataggio…" : "Salva modifiche"}</button>
          </footer>
        </form>
      </div>
    )}
    </>
  );
}
