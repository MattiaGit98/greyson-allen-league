"use client";

import { useState, useTransition } from "react";
import type { LeagueTransitionPreview } from "@/lib/league-transition";
import { historyConfirmationForTransition } from "@/lib/phase-history-confirmation";
import { downloadImportableBackup } from "@/lib/download-importable-backup";
import { advanceLeaguePhaseStep } from "./actions";

export function PhaseAdvanceButton({ currentLabel, nextLabel, preview, missingPhaseDate = false, phaseDateNotReached = false }: { currentLabel: string; nextLabel: string; preview: LeagueTransitionPreview; missingPhaseDate?: boolean; phaseDateNotReached?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState("");
  const [historyConfirmed, setHistoryConfirmed] = useState(false);
  const historyConfirmation = historyConfirmationForTransition(preview.transition);

  async function advance() {
    if (advancing || pending || preview.errors.length || missingPhaseDate || phaseDateNotReached || (historyConfirmation && !historyConfirmed)) return;
    setError("");
    setAdvancing(true);
    try {
      await downloadImportableBackup();
      const formData = new FormData();
      if (historyConfirmation) formData.set(historyConfirmation.field, "true");
      startTransition(() => advanceLeaguePhaseStep(formData));
    } catch (cause) {
      setAdvancing(false);
      setError(cause instanceof Error ? cause.message : "Backup non riuscito.");
    }
  }

  function closeModal() {
    if (advancing || pending) return;
    setOpen(false);
    setHistoryConfirmed(false);
    setError("");
  }

  return (
    <>
      <button className="button primary" type="button" onClick={() => { setHistoryConfirmed(false); setError(""); setOpen(true); }} disabled={missingPhaseDate || phaseDateNotReached}>Esegui il prossimo passaggio</button>
      {open && (
        <div className="auction-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
          <section className="auction-modal phase-confirm-modal" role="dialog" aria-modal="true" aria-label={`Passaggio a ${nextLabel}`} data-live-auto-refresh={advancing ? "true" : undefined}>
            <div className="auction-modal-header">
              <div><span>Avanzamento della lega</span><strong>{preview.label}</strong><small>{currentLabel} → {nextLabel}</small></div>
              <button type="button" onClick={closeModal} disabled={advancing || pending} aria-label="Chiudi">×</button>
            </div>
            <div className="auction-modal-body phase-confirm-body">
              <PreviewSection title="Operazioni automatiche" items={preview.automaticActions} tone="automatic" />
              <PreviewSection title="Nuove possibilità" items={preview.newPossibilities} tone="opening" />
              <PreviewSection title="Possibilità concluse" items={preview.closedPossibilities} tone="closing" />
              <PreviewSection title="Backup e indicazioni" items={preview.warnings} tone="warning" />
              {preview.errors.length > 0 && <PreviewSection title="Errori da risolvere" items={preview.errors} tone="error" />}
              {historyConfirmation && (
                <label className="phase-history-confirmation">
                  <input type="checkbox" checked={historyConfirmed} onChange={(event) => setHistoryConfirmed(event.target.checked)} disabled={advancing || pending} />
                  <span>{historyConfirmation.label}</span>
                </label>
              )}
              {error && <p className="validation error">{error}</p>}
            </div>
            <div className="auction-modal-actions">
              <button className="button secondary" type="button" onClick={closeModal} disabled={advancing || pending}>Annulla</button>
              <button className="button primary" type="button" onClick={advance} disabled={advancing || pending || preview.errors.length > 0 || missingPhaseDate || phaseDateNotReached || Boolean(historyConfirmation && !historyConfirmed)}>
                {advancing || pending ? "Backup e passaggio in corso…" : "Conferma e scarica backup"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function PreviewSection({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return <section className={`phase-preview-section ${tone}`}><strong>{title}</strong><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>;
}
