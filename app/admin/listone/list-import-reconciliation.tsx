"use client";

import { useActionState, useMemo, useState } from "react";
import { nbaTeams } from "@/data/nba-teams";
import type { PlayerListEntry } from "@/lib/league-types";
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

export function PlayerListImport() {
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
      {state.preview && <ReconciliationDialog preview={state.preview} key={state.preview.previewKey} />}
    </>
  );
}

function ReconciliationDialog({ preview }: { preview: NonNullable<PlayerListImportState["preview"]> }) {
  const [dismissed, setDismissed] = useState(false);
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>(() => Object.fromEntries(
    preview.mismatches.map((mismatch) => [mismatch.sourceName, {
      sourceName: mismatch.sourceName,
      kind: mismatch.suggestedName ? "existing" : "new",
      targetName: mismatch.suggestedName ?? mismatch.sourceName,
      realTeam: "",
    }]),
  ));
  if (dismissed) return null;
  const serialized = preview.mismatches.map((mismatch) => resolutions[mismatch.sourceName]);
  const incomplete = serialized.some((resolution) => (
    !resolution?.targetName.trim() || (resolution.kind === "new" && !resolution.realTeam)
  ));
  const editingMismatch = preview.mismatches.find((mismatch) => mismatch.sourceName === editingSource);

  return (
    <div className="auction-modal-backdrop list-reconciliation-backdrop" role="presentation">
      <form action={confirmPlayerListImport} className="auction-modal list-reconciliation-modal" role="dialog" aria-modal="true" aria-label="Verifica nomi del listone">
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
                  <div className="list-reconciliation-row" key={mismatch.sourceName}>
                    <div><strong>{mismatch.sourceName}</strong><small>{mismatch.references.join(" · ")}</small></div>
                    <div>
                      <strong>{resolution.kind === "existing" ? resolution.targetName : `Nuovo: ${resolution.targetName}`}</strong>
                      {resolution.kind === "new"
                        ? <small className={resolution.realTeam ? "" : "missing"}>Ruolo X · {resolution.realTeam || "squadra reale da indicare"}</small>
                        : <small>{mismatch.suggestedName === resolution.targetName ? "Corrispondenza consigliata" : "Corrispondenza modificata"}</small>}
                    </div>
                    <button type="button" onClick={() => setEditingSource(mismatch.sourceName)}>Modifica</button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="validation success">Tutti i nomi di roster e Q.O. corrispondono perfettamente al listone importato.</p>
          )}
          <p className="list-reconciliation-note">Alla conferma i nomi nei roster, nei tagliati e nelle Q.O. verranno allineati al listone in un’unica operazione.</p>
        </div>
        <div className="auction-modal-actions">
          <button className="button secondary" type="button" onClick={() => setDismissed(true)}>Annulla importazione</button>
          <button className="button primary" type="submit" disabled={incomplete}>Conferma e pubblica</button>
        </div>
      </form>

      {editingMismatch && (
        <MatchChoiceDialog
          mismatch={editingMismatch}
          players={preview.players}
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

function MatchChoiceDialog({ mismatch, players, initial, onCancel, onSave }: {
  mismatch: PlayerListImportMismatch;
  players: PlayerListEntry[];
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
            <label><input type="radio" checked={kind === "new"} onChange={() => { setKind("new"); setTargetName(mismatch.sourceName); }} /><strong>Nuovo giocatore</strong></label>
          </div>
          {kind === "existing" ? (
            <div className="match-existing-player-fields">
              <label><span>Cerca nel listone</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Scrivi il nome…" /></label>
              <label><span>Giocatore</span><select size={Math.min(8, Math.max(3, filteredPlayers.length))} value={targetName} onChange={(event) => setTargetName(event.target.value)}>{filteredPlayers.map((player) => <option value={player.name} key={player.name}>{player.name} · {player.role} · {player.realTeam || "—"}</option>)}</select></label>
            </div>
          ) : (
            <div className="match-new-player-fields">
              <label><span>Nome da aggiungere</span><input value={targetName} onChange={(event) => setTargetName(event.target.value)} maxLength={120} /></label>
              <label><span>Squadra reale</span><select value={realTeam} onChange={(event) => setRealTeam(event.target.value)}><option value="">Seleziona</option><option value="FA">Nessuna squadra NBA</option>{nbaTeams.map((team) => <option value={team.code} key={team.code}>{team.code} · {team.name}</option>)}</select></label>
              <p className="validation warning">Il giocatore verrà aggiunto in fondo al listone con ruolo X.</p>
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
