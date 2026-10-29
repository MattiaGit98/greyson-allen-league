"use client";

import { useState } from "react";

const contextUrl = "https://greyson-allen-league.vercel.app/ai-context";

export function HomeAiContext() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(contextUrl);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <section className="home-ai-context" aria-labelledby="home-ai-context-title">
      <h2 id="home-ai-context-title">Analizza la lega con l’IA</h2>
      <p>Per permettere ad assistenti AI di leggere i dati della Greyson Allen League, condividi con loro questo indirizzo:</p>
      <div>
        <span>{contextUrl}</span>
        <button className="button secondary" type="button" onClick={copyAddress} aria-live="polite">
          {copyState === "copied" ? "Copiato" : copyState === "error" ? "Riprova" : "Copia"}
        </button>
      </div>
    </section>
  );
}
