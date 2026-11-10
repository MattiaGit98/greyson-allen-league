"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { startManualPageLoadRecovery, startPageLoadRecovery } from "@/lib/page-load-recovery";

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const [retrying, setRetrying] = useState(true);
  const [manualRetry, setManualRetry] = useState(false);

  useEffect(() => {
    if (manualRetry) {
      return startManualPageLoadRecovery({
        pathname: window.location.pathname,
        storage: () => window.sessionStorage,
        reload: () => window.location.reload(),
        onRetrying: (value) => {
          setRetrying(value);
          if (!value) setManualRetry(false);
        },
      });
    }
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
  }, [error, manualRetry]);

  if (retrying) {
    return (
      <section className="league-state-screen league-loading-screen" role="status" aria-live="polite" aria-busy="true" aria-label="Caricamento della lega">
        <div className="league-loading-content">
          <Image className="league-loading-logo" src="/icons/icon-192.png" alt="Greyson Allen League" width={128} height={128} priority unoptimized />
          <p>Caricamento della lega…</p>
          <span className="league-loading-spinner" aria-hidden="true" />
        </div>
      </section>
    );
  }

  return (
    <section className="league-state-screen league-error-screen" role="alert" aria-labelledby="league-error-title">
      <div className="league-error-content">
        <h1 id="league-error-title">Impossibile caricare la lega</h1>
        <button className="button primary league-reload-button" type="button" onClick={() => { setRetrying(true); setManualRetry(true); }}>Clicca qui per ricaricare la pagina</button>
      </div>
    </section>
  );
}
