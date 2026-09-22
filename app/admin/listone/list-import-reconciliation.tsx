"use client";

import { useActionState, useMemo, useState, useTransition, type FormEvent } from "react";
import { nbaTeams } from "@/data/nba-teams";
import type { PlayerListEntry } from "@/lib/league-types";
import { downloadImportableBackup } from "@/lib/download-importable-backup";
import {
  confirmPlayerListImport,
  preparePlayerListImport,
  type PlayerListImportMismatch,
  type PlayerListImportState,
} from "./actions";

const initialState: PlayerListImportState = {};
type Resolution = {
  sourceName: string;
  kind: "existing" | "new";
  targetName: string;
  realTeam: string;
};

export function PlayerListImport({ showRealTeam }: { showRealTeam: boolean }) {
  const [state, action, pending] = useActionState(preparePlayerListImport, initialState);
  return (
    <>
      <form action={action} className="player-list-import-form">
        <label>
          <span>File Excel</span>
          <input type="file" name="list_file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </label>
        <button className="button primary" type="submit" disabled={pending}>{pending ? "Analisi…" : "Importa come ufficiale"}</button>
      </form>
      {state.error && <p className="notice error list-import-error">Importazione non riuscita: {state.error}</p>}
      {state.preview && <ReconciliationDialog preview={state.preview} showRealTeam={showRealTeam} key={state.preview.previewKey} />}
    </>
  );
}

function ReconciliationDialog({ preview, showRealTeam }: { preview: NonNullable<PlayerListImportState["preview"]>; showRealTeam: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [backupPending, setBackupPending] = useState(false);
  const [publishing, startPublishing] = useTransition();
  const [backupError, setBackupError] = useState("");
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>(() => Object.fromEntries(
    preview.mismatches.map((mismatch) => [mismatch.sourceName, {
      sourceName: mismatch.sourceName,
      kind: mismatch.suggestedName ? "existing" : "new",
      targetName: mismatch.suggestedName ?? mismatch.sourceName,
      realTeam: "FA",
    }]),
  ));
  if (dismissed) return null;
  const serialized = preview.mismatches.map((mismatch) => resolutions[mismatch.sourceName]);
  const incomplete = serialized.some((resolution) => (
    !resolution?.targetName.trim() || (resolution.kind === "new" && !resolution.realTeam)
  ));
  const editingMismatch = preview.mismatches.find((mismatch) => mismatch.sourceName === editingSource);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (incomplete || backupPending || publishing) return;
    const formData = new FormData(event.currentTarget);
    setBackupError("");
    setBackupPending(true);
    try {
      await downloadImportableBackup();
      startPublishing(() => confirmPlayerListImport(formData));
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Backup non riuscito.");
    } finally {
      setBackupPending(false);
    }
  }

  return (
    <div className="auction-modal-backdrop list-reconciliation-backdrop" role="presentation">
      <form onSubmit={publish} className="auction-modal list-reconciliation-modal" role="dialog" aria-modal="true" aria-label="Verifica nomi del listone">
        <input type="hidden" name="imported_players_json" value={JSON.stringify(preview.players)} />
        <input type="hidden" name="resolutions_json" value={JSON.stringify(serialized)} />
        <div className="auction-modal-header">
          <div><span>Importazione listone ufficiale</span><strong>Verifica abbinamenti</strong><small>{preview.players.length} righe importate · {preview.mismatches.length} nomi da controllare</small></div>
          <button type="button" onClick={() => setDismissed(true)} aria-label="Chiudi">×</button>
        </div>
        <div className="auction-modal-body list-reconciliation-body">
          {preview.mismatches.length ? (
            <div className="list-reconciliation-table">
              <div className="list-reconciliation-head"><span>Nome nei roster</span><span>Nome nel listone</span><span></span></div>
              {preview.mismatches.map((mismatch) => {
                const resolution = resolutions[mismatch.sourceName];
                return (
                  <div className={`list-reconciliation-row${resolution.kind === "new" ? " is-new" : ""}`} key={mismatch.sourceName}>
                    <div><strong>{mismatch.sourceName}</strong><small>{mismatch.references.join(" · ")}</small></div>
                    <div>
                      <strong>{resolution.kind === "existing" ? resolution.targetName : `Nuovo: ${resolution.targetName}`}</strong>
                      {resolution.kind === "new"
                        ? <small>X{showRealTeam ? ` · ${resolution.realTeam === "FA" ? "Nessuna squadra NBA" : resolution.realTeam}` : ""}</small>
                        : <small>{mismatch.suggestedName === resolution.targetName ? "Corrispondenza consigliata" : "Corrispondenza modificata"}</small>}
                    </div>
                    <button type="button" onClick={() => setEditingSource(mismatch.sourceName)}>Modifica</button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="auction-modal-actions">
          <button className="button secondary" type="button" onClick={() => setDismissed(true)} disabled={backupPending || publishing}>Annulla importazione</button>
          <button className="button primary" type="submit" disabled={incomplete || backupPending || publishing}>{backupPending || publishing ? "Backup e pubblicazione in corso…" : "Conferma e pubblica"}</button>
        </div>
        {backupError && <p className="validation error">Backup non riuscito: {backupError}</p>}
      </form>

      {editingMismatch && (
        <MatchChoiceDialog
          mismatch={editingMismatch}
          players={preview.players}
          showRealTeam={showRealTeam}
          initial={resolutions[editingMismatch.sourceName]}
          onCancel={() => setEditingSource(null)}
          onSave={(resolution) => {
            setResolutions((current) => ({ ...current, [resolution.sourceName]: resolution }));
            setEditingSource(null);
          }}
        />
      )}
    </div>
  );
}

function MatchChoiceDialog({ mismatch, players, showRealTeam, initial, onCancel, onSave }: {
  mismatch: PlayerListImportMismatch;
  players: PlayerListEntry[];
  showRealTeam: boolean;
  initial: Resolution;
  onCancel: () => void;
  onSave: (resolution: Resolution) => void;
}) {
  const [kind, setKind] = useState<Resolution["kind"]>(initial.kind);
  const [targetName, setTargetName] = useState(initial.targetName);
  const [realTeam, setRealTeam] = useState(initial.realTeam);
  const [search, setSearch] = useState("");
  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("it-IT");
    return players.filter((player) => !query || player.name.toLocaleLowerCase("it-IT").includes(query));
  }, [players, search]);
  const valid = Boolean(targetName.trim() && (kind === "existing" || realTeam));

  return (
    <div className="auction-modal-backdrop list-match-choice-backdrop" role="presentation">
      <section className="auction-modal list-match-choice-modal" role="dialog" aria-modal="true" aria-label={`Modifica abbinamento di ${mismatch.sourceName}`}>
        <div className="auction-modal-header">
          <div><span>Nome nei roster</span><strong>{mismatch.sourceName}</strong><small>{mismatch.references.join(" · ")}</small></div>
          <button type="button" onClick={onCancel} aria-label="Chiudi">×</button>
        </div>
        <div className="auction-modal-body">
          <div className="match-kind-choice">
            <label><input type="radio" checked={kind === "existing"} onChange={() => { setKind("existing"); setTargetName(mismatch.suggestedName ?? players[0]?.name ?? ""); }} /><strong>Giocatore del listone</strong></label>
            <label><input type="radio" checked={kind === "new"} onChange={() => { setKind("new"); setTargetName(mismatch.sourceName); setRealTeam("FA"); }} /><strong>Nuovo giocatore</strong></label>
          </div>
          {kind === "existing" ? (
            <div className="match-existing-player-fields">
              <label><span>Cerca nel listone</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Scrivi il nome…" /></label>
              <label><span>Giocatore</span><select size={Math.min(8, Math.max(3, filteredPlayers.length))} value={targetName} onChange={(event) => setTargetName(event.target.value)}>{filteredPlayers.map((player) => <option value={player.name} key={player.name}>{player.name} · {player.role}{showRealTeam ? ` · ${player.realTeam || "—"}` : ""}</option>)}</select></label>
            </div>
          ) : (
            <div className="match-new-player-fields">
              <label><span>Nome da aggiungere</span><input value={targetName} onChange={(event) => setTargetName(event.target.value)} maxLength={120} /></label>
              <label><span>Ruolo</span><select value="X" disabled><option value="X">X · Nessun ruolo Dunkest</option></select></label>
              {showRealTeam && <label><span>Squadra NBA</span><select value={realTeam} onChange={(event) => setRealTeam(event.target.value)}><option value="FA">Nessuna squadra NBA</option>{nbaTeams.map((team) => <option value={team.code} key={team.code}>{team.code} · {team.name}</option>)}</select></label>}
            </div>
          )}
        </div>
        <div className="auction-modal-actions">
          <button className="button secondary" type="button" onClick={onCancel}>Annulla</button>
          <button className="button primary" type="button" disabled={!valid} onClick={() => onSave({ sourceName: mismatch.sourceName, kind, targetName: targetName.trim(), realTeam })}>Salva scelta</button>
        </div>
      </section>
    </div>
  );
}
