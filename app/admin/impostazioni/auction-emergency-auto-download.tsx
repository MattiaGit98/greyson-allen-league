"use client";

import { useEffect, useRef, useState } from "react";

export function AuctionEmergencyAutoDownload({ exportId }: { exportId: string }) {
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const started = useRef(false);
  const storageKey = `auction-emergency-export:${exportId}`;

  async function download() {
    setError("");
    setDownloading(true);
    try {
      const response = await fetch("/admin/backup/asta", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error((await response.text()) || "Il server non ha generato l'Excel.");
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/i)?.[1] ?? "asta-emergenza.xlsx";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      try { sessionStorage.setItem(storageKey, "done"); } catch { /* Download already started. */ }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Download non riuscito.");
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    try { if (sessionStorage.getItem(storageKey) === "done") return; } catch { /* Continue without deduplication. */ }
    void download();
  }, [storageKey]);

  if (!error) return downloading ? <p className="notice">Preparazione dell'Excel di emergenza asta...</p> : null;
  return (
    <p className="notice error">
      L'avanzamento è riuscito, ma l'Excel di emergenza non è stato scaricato: {error}{" "}
      <button className="button" type="button" onClick={() => void download()} disabled={downloading}>Riprova il download</button>
    </p>
  );
}
