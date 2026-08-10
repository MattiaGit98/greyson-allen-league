"use client";

import { useState } from "react";
import { revertMovement } from "./actions";

type ReversalPreviewTeam = {
  code: string;
  name: string;
  slots: { regular: number; two_way: number; g_league: number; dpe: number };
  capSpaces: { seasonName: string; space: number }[];
};

export function UndoMovementButton({
  movementId,
  summary,
  preview,
  roleMinimumConfirmationRequired,
  disabled,
}: {
  movementId: string;
  summary: string;
  preview: ReversalPreviewTeam[];
  roleMinimumConfirmationRequired: boolean;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [roleMinimumConfirmed, setRoleMinimumConfirmed] = useState(false);
  return (
    <>
      <button className="button secondary" type="button" disabled={disabled} onClick={() => setOpen(true)}>Annulla movimento</button>
      {open && (
        <div className="movement-reversal-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="movement-reversal-modal" role="dialog" aria-modal="true" aria-label="Conferma annullamento movimento" onMouseDown={(event) => event.stopPropagation()}>
            <div className="movement-reversal-modal-head">
              <div><span>Annullamento movimento</span><strong>{summary}</strong></div>
              <button className="icon-button" type="button" aria-label="Chiudi" onClick={() => setOpen(false)}>×</button>
            </div>
            <p>Situazione prevista dopo l’annullamento.</p>
            <div className="movement-reversal-preview-list">
              {preview.map((team) => (
                <article key={team.code}>
                  <strong>{team.name}</strong>
                  <span className="movement-reversal-team-code">{team.code}</span>
                  <div className="movement-reversal-metrics">
                    <span>Cap libero<strong>{team.capSpaces.map(({ seasonName, space }) => `${seasonName}: ${space}`).join(" · ")}</strong></span>
                    <span>Slot<strong>{team.slots.regular}/15 · {team.slots.two_way}/2 · {team.slots.g_league}/3 · {team.slots.dpe}/1</strong></span>
                  </div>
                </article>
              ))}
              {!preview.length && <p>Nessun roster o scelta di squadra verrebbe modificato.</p>}
            </div>
            {roleMinimumConfirmationRequired && (
              <label className="operation-check role-minimum-check movement-role-minimum-check">
                <input type="checkbox" checked={roleMinimumConfirmed} onChange={(event) => setRoleMinimumConfirmed(event.target.checked)} />
                Confermo che assegnerò in seguito i free agent casuali da 1 credito necessari per ripristinare i ruoli.
              </label>
            )}
            <form action={revertMovement} className="movement-reversal-modal-actions">
              <input type="hidden" name="movement_id" value={movementId} />
              <input type="hidden" name="role_minimum_confirmed" value={String(roleMinimumConfirmed)} />
              <button className="button secondary" type="button" onClick={() => setOpen(false)}>Indietro</button>
              <button className="button primary" type="submit" disabled={roleMinimumConfirmationRequired && !roleMinimumConfirmed}>Conferma annullamento</button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
