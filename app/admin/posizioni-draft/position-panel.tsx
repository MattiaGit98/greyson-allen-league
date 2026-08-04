"use client";

import { useMemo, useState } from "react";
import { finalizeDraftPositions, saveDraftPositionDraft } from "./actions";

type TeamOption = { code: string; name: string };
type DraftRound = "1° giro" | "2° giro";
type AssignmentRow = {
  position: number;
  originTeamCode: string;
  isBonus: boolean;
  round: DraftRound;
  cost: number | null;
};

export function DraftPositionPanel({
  draftYear,
  teams,
  initialAssignments,
  finalized,
}: {
  draftYear: number | null;
  teams: TeamOption[];
  initialAssignments: AssignmentRow[];
  finalized: boolean;
}) {
  const [assignments, setAssignments] = useState(() => renumberAssignments(initialAssignments));
  const [reviewingFinalSave, setReviewingFinalSave] = useState(false);
  const finalErrors = useMemo(
    () => validateAssignments(assignments, teams),
    [assignments, teams],
  );
  const definedPositions = assignments.filter((assignment) => assignment.originTeamCode).length;
  const definedCosts = assignments.filter((assignment) => Number.isInteger(assignment.cost) && Number(assignment.cost) > 0).length;
  const firstRoundAssignments = assignments.filter((assignment) => assignment.round === "1° giro");
  const secondRoundAssignments = assignments.filter((assignment) => assignment.round === "2° giro");
  const firstRoundOrdinary = firstRoundAssignments.filter((assignment) => !assignment.isBonus).length;
  const secondRoundOrdinary = secondRoundAssignments.filter((assignment) => !assignment.isBonus).length;
  const bonusCount = assignments.filter((assignment) => assignment.isBonus).length;
  const minimumRows = teams.length * 2;
  const allRowsFilled = assignments.length >= minimumRows
    && definedPositions === assignments.length
    && definedCosts === assignments.length;
  const finalChecksPassed = allRowsFilled && !finalErrors.length;

  function updateAssignment(position: number, patch: Partial<Pick<AssignmentRow, "originTeamCode" | "isBonus" | "cost">>) {
    setAssignments((current) => current.map((assignment) => (
      assignment.position === position ? { ...assignment, ...patch } : assignment
    )));
  }

  function addRow(round: DraftRound) {
    setAssignments((current) => {
      return renumberAssignments([
        ...current,
        {
          position: current.length + 1,
          originTeamCode: "",
          isBonus: false,
          round,
          cost: round === "2° giro" ? 1 : null,
        },
      ]);
    });
    setForceReviewClosed();
  }

  function removeRow(position: number) {
    setAssignments((current) => renumberAssignments(current.filter((assignment) => assignment.position !== position)));
    setForceReviewClosed();
  }

  function setForceReviewClosed() {
    setReviewingFinalSave(false);
  }

  if (draftYear === null) {
    return <p className="notice draft-panel-notice">Nessuna scelta disponibile per il prossimo draft.</p>;
  }

  return (
    <form action={saveDraftPositionDraft} className={`draft-position-panel ${finalized ? "finalized" : ""}`}>
      <input type="hidden" name="draft_year" value={draftYear} />
      <input type="hidden" name="positions_json" value={JSON.stringify(assignments)} />
      <div className="draft-position-year">
        <span>Prossimo draft</span>
        <strong>{draftYear}</strong>
      </div>

      <DraftRoundTable
        title="Primo giro"
        round="1° giro"
        assignments={firstRoundAssignments}
        teams={teams}
        locked={finalized}
        updateAssignment={updateAssignment}
        addRow={addRow}
        removeRow={removeRow}
      />
      <DraftRoundTable
        title="Secondo giro"
        round="2° giro"
        assignments={secondRoundAssignments}
        teams={teams}
        locked={finalized}
        updateAssignment={updateAssignment}
        addRow={addRow}
        removeRow={removeRow}
      />

      <div className="draft-position-footer">
        <div>
          <span className="draft-position-progress">Righe presenti: {assignments.length} · Squadre inserite: {definedPositions}/{assignments.length} · Costi inseriti: {definedCosts}/{assignments.length} · Ordinarie: 1° {firstRoundOrdinary}/{teams.length}, 2° {secondRoundOrdinary}/{teams.length} · Bonus: {bonusCount}</span>
          {!finalized && !allRowsFilled && <p className="validation warning">Bozza modificabile: servono almeno {teams.length} scelte ordinarie per giro; ogni riga aggiuntiva deve essere bonus. Completa squadra e costo di tutte le righe per il salvataggio ufficiale.</p>}
          {!finalized && allRowsFilled && finalChecksPassed && <p className="validation success">Salvataggio finale: tutti i controlli sono superati. Dopo la conferma l'ordine non sarà più modificabile.</p>}
          {!finalized && allRowsFilled && !finalChecksPassed && <p className="validation error">Salvataggio finale non disponibile: i controlli non sono stati superati.</p>}
          {!finalized && allRowsFilled && finalErrors.map((error) => <p className="validation error" key={error}>{error}</p>)}
          {finalized && <p className="validation success">Ordine definitivo del Draft {draftYear}: posizioni e scelte bonus non sono più modificabili.</p>}
        </div>
        {!finalized && (
          <div className="draft-position-footer-actions">
            {(!allRowsFilled || !finalChecksPassed) && <button className="button secondary" type="submit" disabled={!assignments.length}>Salva bozza</button>}
            {finalChecksPassed && <button className="button primary" type="button" onClick={() => setReviewingFinalSave(true)}>Completa ordine Draft</button>}
          </div>
        )}
      </div>

      {reviewingFinalSave && finalChecksPassed && (
        <div className="auction-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewingFinalSave(false); }}>
          <section className="auction-modal draft-position-final-modal" role="alertdialog" aria-modal="true" aria-label={`Conferma ordine definitivo Draft ${draftYear}`}>
            <div className="auction-modal-header">
              <div><span>Salvataggio finale</span><strong>Draft {draftYear}</strong><small>{assignments.length} posizioni complete</small></div>
              <button type="button" onClick={() => setReviewingFinalSave(false)} aria-label="Chiudi">×</button>
            </div>
            <div className="auction-modal-body">
              <p className="validation success">Tutti i controlli sono stati superati.</p>
              <ul className="draft-position-final-checks">
                <li>{teams.length * 2} scelte ordinarie verranno abbinate alle posizioni indicate.</li>
                <li>{bonusCount} scelte bonus verranno create e assegnate alle squadre indicate.</li>
                <li>Tutte le scelte useranno il costo indicato nel tabellone.</li>
                <li>Protezioni e diritti di swap verranno applicati sul risultato definitivo.</li>
                <li>Dopo la conferma il tabellone non potrà più essere modificato o annullato.</li>
              </ul>
            </div>
            <div className="auction-modal-actions">
              <button className="button secondary" type="button" onClick={() => setReviewingFinalSave(false)}>Torna al tabellone</button>
              <button className="button primary" type="submit" formAction={finalizeDraftPositions}>Conferma ordine definitivo</button>
            </div>
          </section>
        </div>
      )}
    </form>
  );
}

function DraftRoundTable({
  title,
  round,
  assignments,
  teams,
  locked,
  updateAssignment,
  addRow,
  removeRow,
}: {
  title: string;
  round: DraftRound;
  assignments: AssignmentRow[];
  teams: TeamOption[];
  locked: boolean;
  updateAssignment: (position: number, patch: Partial<Pick<AssignmentRow, "originTeamCode" | "isBonus" | "cost">>) => void;
  addRow: (round: DraftRound) => void;
  removeRow: (position: number) => void;
}) {
  return (
    <section className="draft-round-section">
      <div className="draft-round-label"><strong>{title}</strong><span>{assignments.length} scelte</span></div>
      <div className="draft-position-table draft-order-table">
        <div className="draft-position-head"><span>Posizione</span><span>Scelta originaria</span><span>Costo</span><span>Bonus</span><span></span></div>
        {assignments.map((assignment) => {
          return (
            <div className={`draft-position-row ${assignment.originTeamCode ? "defined" : ""} ${assignment.isBonus ? "bonus" : ""}`} key={`${assignment.round}-${assignment.position}`}>
              <div className="draft-position-pick"><strong>#{assignment.position}</strong></div>
              <label className="draft-order-team">
                <span>Scelta originaria</span>
                <select value={assignment.originTeamCode} disabled={locked} onChange={(event) => updateAssignment(assignment.position, { originTeamCode: event.target.value })}>
                  <option value="">Seleziona squadra</option>
                  {teams.map((team) => <option value={team.code} key={team.code}>{formatTeamName(team.name)}</option>)}
                </select>
              </label>
              <label className="draft-order-cost">
                <span>Costo</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={assignment.cost ?? ""}
                  disabled={locked}
                  onChange={(event) => updateAssignment(assignment.position, {
                    cost: event.target.value === "" ? null : Number(event.target.value),
                  })}
                />
              </label>
              <label className="draft-order-bonus">
                <input type="checkbox" checked={assignment.isBonus} disabled={locked} onChange={(event) => updateAssignment(assignment.position, { isBonus: event.target.checked })} />
                <span>Scelta bonus</span>
              </label>
              <button
                className="draft-position-remove"
                type="button"
                disabled={locked}
                aria-label={`Rimuovi posizione ${assignment.position}`}
                title="Rimuovi scelta"
                onClick={() => removeRow(assignment.position)}
              >Rimuovi</button>
            </div>
          );
        })}
        {!assignments.length && <p className="data-empty">Nessuna riga nel {title.toLocaleLowerCase("it-IT")}.</p>}
      </div>
      {!locked && (
        <div className="draft-position-row-controls">
          <button type="button" onClick={() => addRow(round)}>
            + Aggiungi scelta al {title.toLocaleLowerCase("it-IT")}
          </button>
        </div>
      )}
    </section>
  );
}

function validateAssignments(
  assignments: AssignmentRow[],
  teams: TeamOption[],
) {
  const errors: string[] = [];
  if (assignments.some((assignment) => assignment.cost !== null && (!Number.isInteger(assignment.cost) || assignment.cost < 1))) {
    errors.push("I costi devono essere numeri interi positivi.");
  }
  for (const round of ["1° giro", "2° giro"] as const) {
    const rows = assignments.filter((assignment) => assignment.round === round);
    if (rows.length < teams.length) {
      errors.push(`${round}: servono almeno ${teams.length} scelte.`);
    }
    const ordinary = rows
      .filter((assignment) => !assignment.isBonus && assignment.originTeamCode)
      .map((assignment) => assignment.originTeamCode);
    if (new Set(ordinary).size !== ordinary.length) {
      const duplicateCodes = [...new Set(ordinary.filter((code, index) => ordinary.indexOf(code) !== index))];
      const duplicateNames = duplicateCodes.map((code) => formatTeamName(teams.find((team) => team.code === code)?.name ?? code));
      errors.push(`${round}: ${duplicateNames.join(", ")} compare più volte tra le scelte non bonus.`);
    }
    const roundComplete = rows.length >= teams.length && rows.every((assignment) => assignment.originTeamCode);
    if (roundComplete) {
      const missingTeams = teams.filter((team) => !ordinary.includes(team.code));
      if (missingTeams.length) {
        errors.push(`${round}: manca una scelta ordinaria per ${missingTeams.map((team) => formatTeamName(team.name)).join(", ")}.`);
      }
    }
  }
  return errors;
}

function renumberAssignments(assignments: AssignmentRow[]) {
  return (["1° giro", "2° giro"] as const)
    .flatMap((round) => assignments.filter((assignment) => assignment.round === round))
    .map((assignment, index) => ({ ...assignment, position: index + 1 }));
}

function formatTeamName(name: string) {
  return name.toLocaleLowerCase("it-IT").replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("it-IT"));
}
