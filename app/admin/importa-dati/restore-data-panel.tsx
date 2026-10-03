"use client";

import { useState } from "react";
import {
  formatMaximumImportableBackupSize,
  maximumImportableBackupBytes,
} from "@/lib/backup-import-storage";
import { downloadImportableBackup } from "@/lib/download-importable-backup";
import { executeRestoreImportFlow, type RestoreImportStage } from "@/lib/restore-import-flow";
import {
  readRestoreImportResponse,
  RestoreImportRequestError,
} from "@/lib/restore-import-response";
import {
  removeUploadedImportableBackup,
  uploadImportableBackup,
} from "@/lib/upload-importable-backup";

type BackupPreview = {
  exportedAt: string;
  seasonName: string;
  moment: string;
  teams: number;
  rosterEntries: number;
  movements: number;
};

export function RestoreDataPanel({ restored }: { restored: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function selectFile(selectedFile: File | undefined) {
    setFile(null);
    setFileName("");
    setPreview(null);
    setConfirmed(false);
    setError("");
    setStatus("");
    if (!selectedFile) return;
    if (selectedFile.size > maximumImportableBackupBytes) {
      setError(`Il file supera il limite di ${formatMaximumImportableBackupSize()}.`);
      return;
    }
    try {
      const parsed = JSON.parse(await selectedFile.text()) as Record<string, unknown>;
      const payload = record(parsed.payload);
      const season = record(payload?.activeSeason);
      const state = record(payload?.leagueState);
      if (parsed.format !== "greyson-allen-league-importable-backup" || !payload || !season || !state) {
        throw new Error("Il file non è un backup importabile della Greyson Allen League.");
      }
      if (parsed.formatVersion !== 2) throw new Error("Versione del backup non supportata.");
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setPreview({
        exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "",
        seasonName: typeof season.name === "string" ? season.name : "—",
        moment: typeof season.timeline_moment === "string" ? season.timeline_moment : "—",
        teams: Array.isArray(state.teams) ? state.teams.length : 0,
        rosterEntries: Array.isArray(state.rosterEntries) ? state.rosterEntries.length : 0,
        movements: Array.isArray(payload.movements) ? payload.movements.length : 0,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "File non valido.");
    }
  }

  async function restore() {
    if (!file || !preview || !confirmed || pending) return;
    if (!window.confirm(`Ripristinare l'intera lega al backup ${fileName} (${preview.seasonName})?`)) return;

    setPending(true);
    setError("");
    let cleanupFailed = false;
    let cleanupSucceeded = false;

    try {
      await executeRestoreImportFlow({
        downloadCurrentBackup: downloadImportableBackup,
        uploadBackup: (registerStoragePath) => uploadImportableBackup(
          file,
          (uploadedBytes, totalBytes) => {
            const percentage = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
            setStatus(`Caricamento backup… ${percentage}%`);
          },
          registerStoragePath,
        ),
        async requestRestore(storagePath) {
          const restoreStatusTimer = window.setTimeout(() => {
            setStatus("Ripristino della lega…");
          }, 750);
          try {
            const response = await fetch("/admin/importa-dati/apply", {
              method: "POST",
              body: JSON.stringify({ storagePath }),
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
            });
            return await readRestoreImportResponse(response);
          } finally {
            window.clearTimeout(restoreStatusTimer);
          }
        },
        async removeTemporaryBackup(storagePath) {
          await removeUploadedImportableBackup(storagePath);
          cleanupSucceeded = true;
        },
        onStage: (stage) => setStatus(statusForStage(stage)),
        onCleanupError: () => {
          cleanupFailed = true;
        },
      });
      window.location.assign("/admin/importa-dati?restored=1");
    } catch (cause) {
      if (cause instanceof RestoreImportRequestError && cause.restoreCompleted && cleanupSucceeded) {
        window.location.assign("/admin/importa-dati?restored=1");
        return;
      }
      const baseMessage = cause instanceof Error ? cause.message : "Ripristino non riuscito.";
      setError(cleanupFailed && !baseMessage.includes("file temporaneo")
        ? `${baseMessage} Non è stato possibile completare la pulizia del file temporaneo.`
        : baseMessage);
      setStatus("");
      setPending(false);
    }
  }

  return (
    <>
      {restored && <p className="notice success">Backup importato. L’intera lega è stata ripristinata.</p>}
      <section className="import-data-card">
        <div className="import-data-card-head">
          <div className="import-data-mark" aria-hidden="true">↥</div>
          <div><strong>Backup importabile</strong><span>Ripristino completo della lega</span></div>
          <a className="button secondary" href="/admin/importa-dati/backup">Scarica situazione attuale</a>
        </div>

        <label className="import-data-file">
          <span>File da importare</span>
          <input type="file" accept=".json,application/json" onChange={(event) => void selectFile(event.target.files?.[0])} disabled={pending} />
          <strong>{fileName || "Seleziona un backup ripristinabile"}</strong>
        </label>

        {preview && (
          <div className="import-data-preview">
            <div><span>Annata</span><strong>{preview.seasonName}</strong></div>
            <div><span>Momento</span><strong>{formatMoment(preview.moment)}</strong></div>
            <div><span>Squadre</span><strong>{preview.teams}</strong></div>
            <div><span>Contratti</span><strong>{preview.rosterEntries}</strong></div>
            <div><span>Movimenti</span><strong>{preview.movements}</strong></div>
            <div><span>Esportato</span><strong>{formatDate(preview.exportedAt)}</strong></div>
          </div>
        )}

        {preview && (
          <label className="import-data-confirm">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={pending} />
            <span>Confermo di voler riportare l’intera lega al punto salvato, comprese fase e date, squadre, roster, listone, bozze dei contratti, calendario, classifiche, storico e movimenti.</span>
          </label>
        )}
        {status && <p className="notice" aria-live="polite">{status}</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
        <button className="button primary import-data-submit" type="button" onClick={restore} disabled={!preview || !confirmed || pending}>
          {pending ? "Ripristino in corso…" : "Ripristina intera lega"}
        </button>
      </section>
    </>
  );
}

function statusForStage(stage: RestoreImportStage) {
  if (stage === "backup") return "Download del backup preventivo…";
  if (stage === "upload") return "Caricamento backup…";
  if (stage === "verify") return "Verifica backup…";
  return "Pulizia file temporaneo…";
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function formatMoment(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(date);
}
