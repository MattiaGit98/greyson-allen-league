"use client";

import { useState } from "react";
import { prepareMovementReversal, revertMovement } from "./actions";

type ReversalPreviewTeam = {
  code: string;
  name: string;
  slotsBefore: SlotCounts;
  slotsAfter: SlotCounts;
  rolesBefore: RoleCounts;
  rolesAfter: RoleCounts;
  capSpaces: { seasonName: string; before: number; after: number }[];
};

type SlotCounts = { regular: number; two_way: number; g_league: number; dpe: number };
type RoleCounts = { G: number; A: number; C: number };

export function UndoMovementButton({
  movementId,
  summary,
  preview,
  roleMinimumConfirmationRequired,
  disabled,
  triggerLabel = "Annulla movimento",
  triggerClassName,
  triggerAriaLabel,
  requireExplicitConfirmation = false,
  returnPath = "/admin/movimenti",
  auctionAssignmentOnly = false,
}: {
  movementId: string;
  summary: string;
  preview?: ReversalPreviewTeam[];
  roleMinimumConfirmationRequired?: boolean;
  disabled: boolean;
  triggerLabel?: string;
  triggerClassName?: string;
  triggerAriaLabel?: string;
  requireExplicitConfirmation?: boolean;
  returnPath?: "/admin/movimenti" | "/admin/asta";
  auctionAssignmentOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [roleMinimumConfirmed, setRoleMinimumConfirmed] = useState(false);
  const [explicitConfirmed, setExplicitConfirmed] = useState(false);
  const [preparedPreview, setPreparedPreview] = useState<ReversalPreviewTeam[] | null>(preview ?? null);
  const [preparedRoleConfirmation, setPreparedRoleConfirmation] = useState(roleMinimumConfirmationRequired ?? false);
  const [preparationError, setPreparationError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const effectivePreview = preview ?? preparedPreview;
  const effectiveRoleConfirmation = preview === undefined ? preparedRoleConfirmation : (roleMinimumConfirmationRequired ?? false);

  async function openPreview() {
    setOpen(true);
    setPreparationError("");
    setRoleMinimumConfirmed(false);
    setExplicitConfirmed(false);
    if (preview !== undefined) return;
    setPreparedPreview(null);
    setPreparing(true);
    try {
      const result = await prepareMovementReversal(movementId);
      if (result.ok) {
        setPreparedPreview(result.preview);
        setPreparedRoleConfirmation(result.roleMinimumConfirmationRequired);
      } else {
        setPreparationError(result.reason);
      }
    } catch {
      setPreparationError("Verifica dell'annullamento non riuscita. Riprova.");
    } finally {
      setPreparing(false);
    }
  }
  return (
    <>
      <button className={triggerClassName ?? "button secondary"} type="button" disabled={disabled || preparing} aria-label={triggerAriaLabel} onClick={() => void openPreview()}>{preparing ? "Verifica…" : triggerLabel}</button>
      {open && (
        <div className="movement-reversal-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="movement-reversal-modal" role="dialog" aria-modal="true" aria-label="Conferma annullamento movimento" onMouseDown={(event) => event.stopPropagation()}>
            <div className="movement-reversal-modal-head">
              <div><span>Annullamento movimento</span><strong>{summary}</strong></div>
            </div>
            <div className="movement-reversal-preview-list">
              {preparing && <p>Verifica delle conseguenze dell'annullamento…</p>}
              {preparationError && <p className="validation error">{preparationError}</p>}
              {effectivePreview?.map((team) => (
                <article key={team.code}>
                  <div className="movement-reversal-team-heading">
                    <strong>{team.name}</strong>
                    <span className="movement-reversal-team-code">{team.code}</span>
                  </div>
                  <div className="auction-modal-summary cap-three-years">
                    {team.capSpaces.map(({ seasonName, before, after }) => (
                      <Metric label={`Cap libero ${seasonName}`} value={`${before} → ${after}`} key={seasonName} />
                    ))}
                  </div>
                  <div className="auction-modal-summary operation-comparison-summary">
                    <Metric label="Ruoli" value={`${formatRoles(team.rolesBefore)} → ${formatRoles(team.rolesAfter)}`} />
                    <Metric label="Slot" value={`${formatSlots(team.slotsBefore)} → ${formatSlots(team.slotsAfter)}`} />
                  </div>
                </article>
              ))}
              {effectivePreview && !effectivePreview.length && <p>Nessun roster o scelta di squadra verrebbe modificato.</p>}
            </div>
            {effectivePreview && effectiveRoleConfirmation && (
              <label className="operation-check role-minimum-check movement-role-minimum-check">
                <input type="checkbox" checked={roleMinimumConfirmed} onChange={(event) => setRoleMinimumConfirmed(event.target.checked)} />
                Confermo che assegnerò in seguito i free agent casuali da 1 credito necessari per ripristinare i ruoli.
              </label>
            )}
            {requireExplicitConfirmation && (
              <label className="operation-check movement-role-minimum-check">
                <input type="checkbox" checked={explicitConfirmed} onChange={(event) => setExplicitConfirmed(event.target.checked)} />
                Confermo di voler annullare definitivamente questa assegnazione d’asta.
              </label>
            )}
            <form action={revertMovement} className="movement-reversal-modal-actions">
              <input type="hidden" name="movement_id" value={movementId} />
              <input type="hidden" name="role_minimum_confirmed" value={String(roleMinimumConfirmed)} />
              <input type="hidden" name="return_path" value={returnPath} />
              <input type="hidden" name="auction_assignment_only" value={String(auctionAssignmentOnly)} />
              <button className="button secondary" type="button" onClick={() => setOpen(false)}>Indietro</button>
              <button className="button primary" type="submit" disabled={!effectivePreview || Boolean(preparationError) || (effectiveRoleConfirmation && !roleMinimumConfirmed) || (requireExplicitConfirmation && !explicitConfirmed)}>Conferma annullamento</button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function formatRoles(roles: RoleCounts) {
  return `${roles.G}/5 G · ${roles.A}/5 A · ${roles.C}/3 C`;
}

function formatSlots(slots: SlotCounts) {
  return `${slots.regular}/15 · ${slots.two_way}/2 · ${slots.g_league}/3 · ${slots.dpe}/1`;
}
