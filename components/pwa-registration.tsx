"use client";

import { useEffect, useState } from "react";

export function PwaRegistration() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const updateConnection = () => setOffline(!navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => {
          // La registrazione non deve mai impedire l'uso del sito via rete.
        });
    }

    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="pwa-offline-screen" role="alert" aria-live="assertive">
      <div>
        <h1>Connessione assente</h1>
        <p>I dati della lega sono disponibili solo online. Riconnettiti per visualizzarli.</p>
      </div>
    </div>
  );
}
