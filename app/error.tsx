"use client";

import { useEffect, useState } from "react";
import { startPageLoadRecovery } from "@/lib/page-load-recovery";

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const [retrying, setRetrying] = useState(true);

  useEffect(() => {
    console.error(error);
    const environment = {
      snapshot: () => ({
        href: window.location.href,
        pathname: window.location.pathname,
        online: navigator.onLine,
        visible: document.visibilityState === "visible",
        unfinishedWork: Boolean(document.querySelector("form[data-live-dirty='true'], form[data-live-submitting='true'], form[method='post'], [role='dialog'], [role='alertdialog']")),
        documentStartedAt: performance.timeOrigin,
      }),
      storage: () => window.sessionStorage,
      reload: () => window.location.reload(),
      onRetrying: setRetrying,
    };
    let cancel = startPageLoadRecovery(environment);
    const retryWhenReady = () => {
      cancel();
      cancel = startPageLoadRecovery(environment);
    };
    window.addEventListener("online", retryWhenReady);
    document.addEventListener("visibilitychange", retryWhenReady);
    return () => {
      cancel();
      window.removeEventListener("online", retryWhenReady);
      document.removeEventListener("visibilitychange", retryWhenReady);
    };
  }, [error]);

  return (
    <section className="section page-top">
      <div className={`notice league-data-error${retrying ? "" : " error"}`} role={retrying ? "status" : "alert"} aria-busy={retrying}>
        <strong>{retrying ? "Caricamento della lega…" : "Dati della lega temporaneamente non disponibili."}</strong>
        <span>{retrying ? "Nuovo tentativo di connessione in corso." : "Il sito non mostra copie iniziali o dati vecchi al posto dello stato corrente."}</span>
        {!retrying && <button className="button secondary" type="button" onClick={() => window.location.reload()}>Aggiorna la pagina</button>}
      </div>
    </section>
  );
}
