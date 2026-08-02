"use client";

import { useActionState, useMemo, useState } from "react";
import type { DraftAsset, QualifyingOfferRight, RosterEntry, TeamSummary } from "@/lib/league-types";
import { findTeamSlotOverflows, slotOverflowMessage } from "@/lib/roster-slot-limits";
import { calculateCapSpace, followingSeasonName } from "@/lib/season-time";
import { saveTeamCorrection, type LeagueEditorSaveState } from "./actions";

type RosterRow = RosterEntry & { key: string };
type DraftRow = DraftAsset & { key: string };
type QualifyingRow = QualifyingOfferRight & { key: string };
type Placement = "regular" | "two_way" | "g_league" | "dpe" | "cut";

const initialSaveState: LeagueEditorSaveState = {};
const groups: { placement: Placement; label: string; limit?: number }[] = [
  { placement: "regular", label: "Roster", limit: 15 },
  { placement: "two_way", label: "Two-way", limit: 2 },
  { placement: "g_league", label: "G-League", limit: 3 },
  { placement: "dpe", label: "Disabled player exception", limit: 1 },
  { placement: "cut", label: "Tagliati" },
];

export function RosterEditor({
  teams,
  initialRosterEntries,
  initialDraftAssets,
  initialQualifyingOffers,
  seasonName,
  countTeamOptions,
}: {
  teams: TeamSummary[];
  initialRosterEntries: RosterEntry[];
  initialDraftAssets: DraftAsset[];
  initialQualifyingOffers: QualifyingOfferRight[];
  seasonName: string;
  countTeamOptions: boolean;
}) {
  const [teamCode, setTeamCode] = useState(teams[0]?.code ?? "");
  const [rosterRows, setRosterRows] = useState<RosterRow[]>(() => initialRosterEntries.map((row, index) => ({ ...row, key: `roster-${index}` })));
  const [draftRows, setDraftRows] = useState<DraftRow[]>(() => initialDraftAssets.map((row, index) => ({ ...row, key: `draft-${index}` })));
  const [qualifyingRows, setQualifyingRows] = useState<QualifyingRow[]>(() => initialQualifyingOffers.map((row, index) => ({ ...row, key: `qo-${index}` })));
  const [state, action, pending] = useActionState(saveTeamCorrection, initialSaveState);

  const selectedTeam = teams.find((team) => team.code === teamCode) ?? teams[0];
  const teamRoster = rosterRows.filter((row) => row.teamCode === teamCode);
  const teamDraft = draftRows.filter((row) => row.teamCode === teamCode);
  const teamQualifying = qualifyingRows.filter((row) => row.teamCode === teamCode);
  const active = teamRoster.filter((row) => row.state === "active");
  const slotErrors = findTeamSlotOverflows(teamRoster, teamCode).map(slotOverflowMessage);
  const roles = {
    G: active.filter((row) => row.slot !== "dpe" && row.role === "G").length,
    A: active.filter((row) => row.slot !== "dpe" && row.role === "A").length,
    C: active.filter((row) => row.slot !== "dpe" && row.role === "C").length,
  };
  const capSeasons = [seasonName, followingSeasonName(seasonName), followingSeasonName(seasonName, 2)];
  const capSpaces = useMemo(() => capSeasons.map((targetSeason, index) => calculateCapSpace({
    entries: teamRoster.filter((entry) => index !== 0 || entry.state !== "active" || entry.slot !== "dpe"),
    seasonName: targetSeason,
    optionSeasonName: seasonName,
    countTeamOptions,
  })), [countTeamOptions, seasonName, teamRoster]);

  function updateRoster(key: string, patch: Partial<RosterEntry>) {
    setRosterRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  }

  function setPlacement(key: string, placement: Placement) {
    updateRoster(key, placement === "cut"
      ? { state: "cut", slot: "regular" }
      : { state: "active", slot: placement });
  }

  function addRosterRow(placement: Placement) {
    setRosterRows((current) => [...current, {
      key: crypto.randomUUID(),
      name: "Nuovo giocatore",
      role: "G",
      cost: 0,
      contract: "",
      teamCode,
      state: placement === "cut" ? "cut" : "active",
      slot: placement === "cut" ? "regular" : placement,
      stretchProvisionApplied: false,
      buyoutApplied: false,
    }]);
  }

  function updateDraft(key: string, patch: Partial<DraftAsset>) {
    setDraftRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  }

  function updateQualifying(key: string, patch: Partial<QualifyingOfferRight>) {
    setQualifyingRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  }

  return (
    <form action={action} className="roster-editor-form">
      <input type="hidden" name="team_code" value={teamCode} />
      <input type="hidden" name="roster_json" value={JSON.stringify(teamRoster.map(({ key: _key, ...row }) => row))} />
      <input type="hidden" name="draft_json" value={JSON.stringify(teamDraft.map(({ key: _key, ...row }) => row))} />
      <input type="hidden" name="qo_json" value={JSON.stringify(teamQualifying.map(({ key: _key, ...row }) => row))} />

      <div className="roster-contract-legend" aria-label="Legenda scadenze e clausole">
        <span><b>X</b> scadenza</span>
        <span><b>X (E)</b> estendibile</span>
        <span><b>X (Q)</b> qualifying offer</span>
        <span><b>X (2X)</b> raddoppio ex T.O.</span>
        <span><b>+ PO</b> promozione roster da playoff</span>
        <span><b>T.O.</b> team option</span>
      </div>

      <label className="roster-editor-team-select">
        <span>Squadra</span>
        <select value={teamCode} onChange={(event) => setTeamCode(event.target.value)}>
          {teams.map((team) => <option value={team.code} key={team.code}>{formatTeamName(team.name)}</option>)}
        </select>
      </label>

      <div className="team-accordion-content roster-editor-content">
        <div className="current-cap-highlight">
          <span>Cap libero {capSeasons[0]}</span>
          <strong>{capSpaces[0]}</strong>
        </div>
        <div className="team-summary-strip">
          <Summary label={`Cap libero ${capSeasons[1]}`} value={capSpaces[1]} />
          <Summary label={`Cap libero ${capSeasons[2]}`} value={capSpaces[2]} />
          <Summary label="Ruoli" value={`${roles.G} G / ${roles.A} A / ${roles.C} C`} />
        </div>

        {groups.map((group) => {
          const rows = teamRoster.filter((row) => placementOf(row) === group.placement);
          return (
            <EditorSection label={`${group.label}${group.limit ? ` (${rows.length}/${group.limit})` : ""}`} key={group.placement}>
              <div className="roster-edit-table">
                <div className="roster-edit-head"><span>Giocatore</span><span>{group.placement === "cut" ? "Stretch" : "Ruolo"}</span><span>Scadenza / clausole</span><span>Costo</span><span>Posizione</span><span></span></div>
                {rows.map((row) => (
                  <div className="roster-edit-row" key={row.key}>
                    <input aria-label="Giocatore" value={row.name} onChange={(event) => updateRoster(row.key, { name: event.target.value })} />
                    {group.placement === "cut" ? (
                      <label className={`roster-stretch-toggle ${row.stretchProvisionApplied || row.buyoutApplied ? "applied" : ""}`}>
                        <input
                          type="checkbox"
                          checked={row.stretchProvisionApplied === true || row.buyoutApplied === true}
                          onChange={(event) => updateRoster(row.key, event.target.checked
                            ? { stretchProvisionApplied: true }
                            : { stretchProvisionApplied: false, buyoutApplied: false })}
                        />
                        <span>{row.stretchProvisionApplied || row.buyoutApplied ? "X" : "—"}</span>
                      </label>
                    ) : (
                      <select aria-label="Ruolo" value={row.role ?? ""} onChange={(event) => updateRoster(row.key, { role: (event.target.value || undefined) as RosterEntry["role"] })}>
                        <option value="">—</option><option value="G">G</option><option value="A">A</option><option value="C">C</option>
                      </select>
                    )}
                    <input aria-label="Scadenza e clausole" value={row.contract} onChange={(event) => updateRoster(row.key, { contract: event.target.value })} placeholder="es. 28 (E)" />
                    <input aria-label="Costo" type="number" min="0" step="1" value={row.cost} onChange={(event) => updateRoster(row.key, { cost: Number(event.target.value) })} />
                    <select aria-label="Posizione" value={placementOf(row)} onChange={(event) => setPlacement(row.key, event.target.value as Placement)}>
                      <option value="regular">Roster</option><option value="two_way">Two-way</option><option value="g_league">G-League</option><option value="dpe">DPE</option><option value="cut">Tagliato</option>
                    </select>
                    <button type="button" onClick={() => setRosterRows((current) => current.filter((item) => item.key !== row.key))} aria-label={`Elimina ${row.name}`}>×</button>
                  </div>
                ))}
                {!rows.length && <div className="data-empty">—</div>}
              </div>
              <button className="roster-editor-add" type="button" onClick={() => addRosterRow(group.placement)}>+ Aggiungi riga</button>
            </EditorSection>
          );
        })}

        <EditorSection label="Scelte">
          <div className="draft-edit-table">
            <div className="draft-edit-head"><span>Anno</span><span>Giro</span><span>SQ / POS</span><span>Clausola</span><span></span></div>
            {teamDraft.map((row) => (
              <div className="draft-edit-row" key={row.key}>
                <input aria-label="Anno" type="number" min="2020" max="2100" value={row.year} onChange={(event) => updateDraft(row.key, { year: Number(event.target.value) })} />
                <input aria-label="Giro" value={row.round} onChange={(event) => updateDraft(row.key, { round: event.target.value })} />
                <input aria-label="Squadra o posizione" value={row.originOrOverall} onChange={(event) => updateDraft(row.key, { originOrOverall: event.target.value })} />
                <input aria-label="Clausola" value={row.label === "Scelta" ? "" : row.label} onChange={(event) => updateDraft(row.key, { label: event.target.value || "Scelta" })} placeholder="Nessuna clausola" />
                <button type="button" onClick={() => setDraftRows((current) => current.filter((item) => item.key !== row.key))} aria-label="Elimina scelta">×</button>
              </div>
            ))}
            {!teamDraft.length && <div className="data-empty">—</div>}
          </div>
          <button className="roster-editor-add" type="button" onClick={() => setDraftRows((current) => [...current, { key: crypto.randomUUID(), year: Number(seasonName.slice(0, 4)) + 1, round: "1° giro", originOrOverall: teamCode, label: "Scelta", teamCode }])}>+ Aggiungi scelta</button>
        </EditorSection>

        <EditorSection label="Qualifying offer">
          <div className="qo-edit-table">
            <div className="qo-edit-head"><span>Giocatore</span><span>Importo</span><span></span></div>
            {teamQualifying.map((row) => (
              <div className="qo-edit-row" key={row.key}>
                <input aria-label="Giocatore" value={row.playerName} onChange={(event) => updateQualifying(row.key, { playerName: event.target.value })} />
                <input aria-label="Importo" type="number" min="1" step="1" value={row.qualifyingAmount} onChange={(event) => updateQualifying(row.key, { qualifyingAmount: Number(event.target.value) })} />
                <button type="button" onClick={() => setQualifyingRows((current) => current.filter((item) => item.key !== row.key))} aria-label={`Elimina Q.O. ${row.playerName}`}>×</button>
              </div>
            ))}
            {!teamQualifying.length && <div className="data-empty">—</div>}
          </div>
          <button className="roster-editor-add" type="button" onClick={() => setQualifyingRows((current) => [...current, { key: crypto.randomUUID(), playerName: "Nuovo giocatore", qualifyingAmount: 1, teamCode }])}>+ Aggiungi Q.O.</button>
        </EditorSection>
      </div>

      {state.error && <p className="notice error">{state.error}</p>}
      {slotErrors.map((error) => <p className="notice error" key={error}>{error} Libera prima uno slot adeguato.</p>)}
      {state.message && <p className="notice success">{state.message}</p>}
      <button className="button primary roster-editor-save" type="submit" disabled={pending || !selectedTeam || slotErrors.length > 0}>
        {pending ? "Salvataggio…" : "Salva rettifiche"}
      </button>
    </form>
  );
}

function placementOf(row: RosterEntry): Placement {
  return row.state === "cut" ? "cut" : row.slot;
}

function EditorSection({ label, children }: { label: string; children: React.ReactNode }) {
  return <section className="accordion-data-section roster-editor-section"><p>{label}</p>{children}</section>;
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function formatTeamName(name: string) {
  return name.toLocaleLowerCase("it-IT").replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("it-IT"));
}
