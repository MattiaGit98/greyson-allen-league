"use client";

import { useState } from "react";

type BackupPreview = {
  formatVersion: number;
  exportedAt: string;
  seasonName: string;
  moment: string;
  teams: number;
  rosterEntries: number;
  movements: number;
};

export function RestoreDataPanel({ restored }: { restored: boolean }) {
  const [fileName, setFileName] = useState("");
  const [fileText, setFileText] = useState("");
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function selectFile(file: File | undefined) {
    setFileName("");
    setFileText("");
    setPreview(null);
    setConfirmed(false);
    setError("");
    setStatus("");
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setError("Il file supera il limite di 100 MB.");
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const payload = record(parsed.payload);
      const season = record(payload?.activeSeason);
      const state = record(payload?.leagueState);
      if (parsed.format !== "greyson-allen-league-importable-backup" || !payload || !season || !state) {
        throw new Error("Il file non è un backup importabile della Greyson Allen League.");
      }
      setFileName(file.name);
      setFileText(text);
      setPreview({
        formatVersion: typeof parsed.formatVersion === "number" ? parsed.formatVersion : 0,
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
    if (!fileText || !preview || !confirmed || pending) return;
    if (!window.confirm(`Ripristinare l'intera lega al backup ${fileName} (${preview.seasonName})?`)) return;
    setPending(true);
    setError("");
    try {
      setStatus("Preparazione e download del backup della situazione attuale…");
      await downloadCurrentBackup();
      setStatus("Ripristino della lega in corso…");
      const response = await fetch("/admin/importa-dati/apply", {
        method: "POST",
        body: fileText,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Ripristino non riuscito.");
      window.location.assign("/admin/importa-dati?restored=1");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ripristino non riuscito.");
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

        {preview && preview.formatVersion < 2 && (
          <p className="notice error">
            Questo è un backup precedente al formato completo: può ripristinare i dati che contiene, ma non le date delle fasi, le bozze private dei contratti o vecchie modifiche all’anagrafica delle squadre.
          </p>
        )}

        {preview && (
          <label className="import-data-confirm">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={pending} />
            <span>Confermo di voler riportare l’intera lega al punto salvato, comprese fase e date, squadre, roster, listone, bozze dei contratti, calendario, classifiche, storico e movimenti.</span>
          </label>
        )}
        {status && <p className="notice">{status}</p>}
        {error && <p className="notice error">{error}</p>}
        <button className="button primary import-data-submit" type="button" onClick={restore} disabled={!preview || !confirmed || pending}>
          {pending ? "Ripristino in corso…" : "Ripristina intera lega"}
        </button>
      </section>
    </>
  );
}

async function downloadCurrentBackup() {
  const response = await fetch("/admin/importa-dati/backup", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error((await response.text()) || "Backup della situazione attuale non riuscito.");
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = disposition.match(/filename="([^"]+)"/i)?.[1] ?? "greyson-allen-league_ripristino.json";
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
