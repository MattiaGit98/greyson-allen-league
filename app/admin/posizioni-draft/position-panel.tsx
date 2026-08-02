"use client";

import { useMemo, useState } from "react";
import { defaultDraftPositionCount } from "@/lib/draft-positions";
import { saveDraftPositions } from "./actions";

type TeamOption = { code: string; name: string };
type DraftRound = "1° giro" | "2° giro";
type AssignmentRow = {
  position: number;
  originTeamCode: string;
  isBonus: boolean;
  round: DraftRound;
};

export function DraftPositionPanel({
  draftYear,
  teams,
  initialAssignments,
}: {
  draftYear: number | null;
  teams: TeamOption[];
  initialAssignments: AssignmentRow[];
}) {
  const [assignments, setAssignments] = useState(() => renumberAssignments(initialAssignments));
  const maximumRows = draftYear === null ? teams.length * 2 : defaultDraftPositionCount(draftYear, teams.length);
  const maximumRowsPerRound = maximumRows / 2;
  const errors = useMemo(
    () => validateAssignments(assignments, teams, draftYear, maximumRowsPerRound),
    [assignments, teams, draftYear, maximumRowsPerRound],
  );
  const definedPositions = assignments.filter((assignment) => assignment.originTeamCode).length;
  const firstRoundAssignments = assignments.filter((assignment) => assignment.round === "1° giro");
  const secondRoundAssignments = assignments.filter((assignment) => assignment.round === "2° giro");
  const isComplete = assignments.length === maximumRows
    && definedPositions === maximumRows
    && firstRoundAssignments.length === maximumRowsPerRound
    && secondRoundAssignments.length === maximumRowsPerRound
    && !errors.length;

  function updateAssignment(position: number, patch: Partial<Pick<AssignmentRow, "originTeamCode" | "isBonus">>) {
    setAssignments((current) => current.map((assignment) => (
      assignment.position === position ? { ...assignment, ...patch } : assignment
    )));
  }

  function addRow(round: DraftRound) {
    setAssignments((current) => {
      if (current.filter((assignment) => assignment.round === round).length >= maximumRowsPerRound) return current;
      return renumberAssignments([
        ...current,
        { position: current.length + 1, originTeamCode: "", isBonus: false, round },
      ]);
    });
  }

  function removeRow(position: number) {
    setAssignments((current) => {
      const selected = current.find((assignment) => assignment.position === position);
      if (!selected || selected.originTeamCode || selected.isBonus) return current;
      return renumberAssignments(current.filter((assignment) => assignment.position !== position));
    });
  }

  if (draftYear === null) {
    return <p className="notice draft-panel-notice">Nessuna scelta disponibile per il prossimo draft.</p>;
  }

  return (
    <form action={saveDraftPositions} className="draft-position-panel">
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
        canAdd={firstRoundAssignments.length < maximumRowsPerRound}
        updateAssignment={updateAssignment}
        addRow={addRow}
        removeRow={removeRow}
      />
      <DraftRoundTable
        title="Secondo giro"
        round="2° giro"
        assignments={secondRoundAssignments}
        teams={teams}
        canAdd={secondRoundAssignments.length < maximumRowsPerRound}
        updateAssignment={updateAssignment}
        addRow={addRow}
        removeRow={removeRow}
      />

      <div className="draft-position-footer">
        <div>
          <span className="draft-position-progress">Posizioni inserite: {definedPositions}/{maximumRows} · Righe presenti: {assignments.length}/{maximumRows}</span>
          {errors.map((error) => <p className="validation error" key={error}>{error}</p>)}
        </div>
        <button className="button primary" type="submit" disabled={errors.length > 0 || !assignments.length}>
          {isComplete ? "Salva e applica le clausole" : "Salva posizioni"}
        </button>
      </div>
    </form>
  );
}

function DraftRoundTable({
  title,
  round,
  assignments,
  teams,
  canAdd,
  updateAssignment,
  addRow,
  removeRow,
}: {
  title: string;
  round: DraftRound;
  assignments: AssignmentRow[];
  teams: TeamOption[];
  canAdd: boolean;
  updateAssignment: (position: number, patch: Partial<Pick<AssignmentRow, "originTeamCode" | "isBonus">>) => void;
  addRow: (round: DraftRound) => void;
  removeRow: (position: number) => void;
}) {
  return (
    <section className="draft-round-section">
      <div className="draft-round-label"><strong>{title}</strong><span>{assignments.length} scelte</span></div>
      <div className="draft-position-table draft-order-table">
        <div className="draft-position-head"><span>Posizione</span><span>Scelta originaria</span><span>Bonus</span><span></span></div>
        {assignments.map((assignment) => {
          const removalLocked = Boolean(assignment.originTeamCode || assignment.isBonus);
          return (
            <div className={`draft-position-row ${assignment.originTeamCode ? "defined" : ""} ${assignment.isBonus ? "bonus" : ""}`} key={`${assignment.round}-${assignment.position}`}>
              <div className="draft-position-pick"><strong>#{assignment.position}</strong></div>
              <label className="draft-order-team">
                <span>Scelta originaria</span>
                <select value={assignment.originTeamCode} onChange={(event) => updateAssignment(assignment.position, { originTeamCode: event.target.value })}>
                  <option value="">Seleziona squadra</option>
                  {teams.map((team) => <option value={team.code} key={team.code}>{formatTeamName(team.name)}</option>)}
                </select>
              </label>
              <label className="draft-order-bonus">
                <input type="checkbox" checked={assignment.isBonus} onChange={(event) => updateAssignment(assignment.position, { isBonus: event.target.checked })} />
                <span>Scelta bonus</span>
              </label>
              <button
                className="draft-position-remove"
                type="button"
                disabled={removalLocked}
                title={removalLocked ? "Svuota prima la scelta per rimuovere la riga" : "Rimuovi riga"}
                aria-label={`Rimuovi posizione ${assignment.position}`}
                onClick={() => removeRow(assignment.position)}
              >
                Rimuovi
              </button>
            </div>
          );
        })}
        {!assignments.length && <p className="data-empty">Nessuna riga nel {title.toLocaleLowerCase("it-IT")}.</p>}
      </div>
      <div className="draft-position-row-controls">
        <button type="button" onClick={() => addRow(round)} disabled={!canAdd}>+ Aggiungi riga al {title.toLocaleLowerCase("it-IT")}</button>
      </div>
    </section>
  );
}

function validateAssignments(
  assignments: AssignmentRow[],
  teams: TeamOption[],
  draftYear: number | null,
  maximumRowsPerRound: number,
) {
  const errors: string[] = [];
  const expectedBonusCount = draftYear === 2026 ? 0 : 1;
  for (const round of ["1° giro", "2° giro"] as const) {
    const rows = assignments.filter((assignment) => assignment.round === round);
    if (rows.length > maximumRowsPerRound) errors.push(`${round}: risultano troppe righe.`);
    const bonuses = rows.filter((assignment) => assignment.isBonus).length;
    if (bonuses > expectedBonusCount) {
      errors.push(expectedBonusCount ? `${round}: puoi selezionare una sola scelta bonus.` : `${round}: il Draft 2026 non prevede scelte bonus.`);
    }
    const ordinary = rows
      .filter((assignment) => !assignment.isBonus && assignment.originTeamCode)
      .map((assignment) => assignment.originTeamCode);
    if (new Set(ordinary).size !== ordinary.length) {
      const duplicateCodes = [...new Set(ordinary.filter((code, index) => ordinary.indexOf(code) !== index))];
      const duplicateNames = duplicateCodes.map((code) => formatTeamName(teams.find((team) => team.code === code)?.name ?? code));
      errors.push(`${round}: ${duplicateNames.join(", ")} compare più volte tra le scelte non bonus.`);
    }
    const roundComplete = rows.length === maximumRowsPerRound && rows.every((assignment) => assignment.originTeamCode);
    if (roundComplete && bonuses !== expectedBonusCount) {
      errors.push(expectedBonusCount ? `${round}: deve esserci una scelta bonus.` : `${round}: non deve esserci una scelta bonus.`);
    }
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
