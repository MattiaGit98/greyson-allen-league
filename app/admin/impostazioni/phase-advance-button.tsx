"use client";

import { useState, useTransition } from "react";
import type { LeagueTransitionPreview } from "@/lib/league-transition";
import { advanceLeaguePhaseStep } from "./actions";

export function PhaseAdvanceButton({ currentLabel, nextLabel, preview, missingPhaseDate = false, phaseDateNotReached = false }: { currentLabel: string; nextLabel: string; preview: LeagueTransitionPreview; missingPhaseDate?: boolean; phaseDateNotReached?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  async function advance() {
    if (pending || preview.errors.length || missingPhaseDate || phaseDateNotReached) return;
    setError("");
    try {
      await downloadImportableBackup();
      startTransition(() => advanceLeaguePhaseStep());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Backup non riuscito.");
    }
  }

  return (
    <>
      <button className="button primary" type="button" onClick={() => setOpen(true)} disabled={missingPhaseDate || phaseDateNotReached}>Esegui il prossimo passaggio</button>
      {open && (
        <div className="auction-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setOpen(false); }}>
          <section className="auction-modal phase-confirm-modal" role="dialog" aria-modal="true" aria-label={`Passaggio a ${nextLabel}`}>
            <div className="auction-modal-header">
              <div><span>Avanzamento della lega</span><strong>{preview.label}</strong><small>{currentLabel} → {nextLabel}</small></div>
              <button type="button" onClick={() => setOpen(false)} disabled={pending} aria-label="Chiudi">×</button>
            </div>
            <div className="auction-modal-body phase-confirm-body">
              <PreviewSection title="Operazioni automatiche" items={preview.automaticActions} tone="automatic" />
              <PreviewSection title="Nuove possibilità" items={preview.newPossibilities} tone="opening" />
              <PreviewSection title="Possibilità concluse" items={preview.closedPossibilities} tone="closing" />
              <PreviewSection title="Backup e indicazioni" items={preview.warnings} tone="warning" />
              {preview.errors.length > 0 && <PreviewSection title="Errori da risolvere" items={preview.errors} tone="error" />}
              {error && <p className="validation error">{error}</p>}
            </div>
            <div className="auction-modal-actions">
              <button className="button secondary" type="button" onClick={() => setOpen(false)} disabled={pending}>Annulla</button>
              <button className="button primary" type="button" onClick={advance} disabled={pending || preview.errors.length > 0 || missingPhaseDate || phaseDateNotReached}>
                {pending ? "Backup e passaggio in corso…" : "Conferma e scarica backup"}
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

async function downloadImportableBackup() {
  downloadFiles([await fetchBackup("/admin/importa-dati/backup", "backup-ripristino.json")]);
}

function downloadFiles(files: Array<{ blob: Blob; filename: string }>) {
  files.forEach(({ blob, filename }) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  });
}

async function fetchBackup(url: string, fallbackFilename: string) {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error((await response.text()) || "Backup non riuscito.");
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = disposition.match(/filename="([^"]+)"/i)?.[1] ?? fallbackFilename;
  return { blob: await response.blob(), filename };
}
