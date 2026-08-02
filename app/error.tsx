"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="section page-top">
      <div className="notice error league-data-error">
        <strong>Dati della lega temporaneamente non disponibili.</strong>
        <span>Il sito non mostra copie iniziali o dati vecchi al posto dello stato corrente.</span>
        <button className="button secondary" type="button" onClick={reset}>Riprova</button>
      </div>
    </section>
  );
}
