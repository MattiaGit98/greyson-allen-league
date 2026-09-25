"use client";

import {
  contextualSlotLabel,
  emptyContextualSlotDecision,
  resolveContextualSlots,
  type ContextualSlotCounts,
  type ContextualSlotDecision,
  type ContextualSlotPlayer,
} from "@/lib/contextual-slot-resolution";

export function ContextualSlotResolver({
  counts,
  incomingSlot,
  players,
  value,
  onChange,
}: {
  counts: ContextualSlotCounts;
  incomingSlot: "regular" | "two_way" | "g_league";
  players: ContextualSlotPlayer[];
  value: ContextualSlotDecision[];
  onChange: (value: ContextualSlotDecision[]) => void;
}) {
  const resolution = resolveContextualSlots({ counts, incomingSlot, players, decisions: value });
  if (!resolution.steps.length) return null;

  function replaceDecision(index: number, decision: ContextualSlotDecision) {
    onChange([...value.slice(0, index), decision]);
  }

  return (
    <section className="contextual-slot-resolution" aria-label="Operazioni contestuali necessarie">
      <header>
        <span>Slot da liberare</span>
        <strong>Completa le operazioni necessarie</strong>
      </header>
      <div className="contextual-slot-steps">
        {resolution.steps.map((step, index) => {
          const decision = value[index] ?? emptyContextualSlotDecision();
          const promotionPlayer = step.promotionCandidates.find((candidate) => candidate.name === decision.playerName);
          return (
            <fieldset className="contextual-slot-step" key={`${index}-${step.slot}`}>
              <legend>
                <b>{index + 1}</b>
                <span>{index === 0 ? "Libera" : "Libera anche"} lo slot {contextualSlotLabel(step.slot)}</span>
              </legend>

              {step.cutCandidates.length > 0 && (
                <div className={`contextual-slot-choice${decision.kind === "cut" ? " selected" : ""}`}>
                  <label className="contextual-slot-radio">
                    <input
                      type="radio"
                      name={`slot-resolution-${index}`}
                      checked={decision.kind === "cut"}
                      onChange={() => replaceDecision(index, { kind: "cut", playerName: "", destinationSlot: "" })}
                    />
                    <span>Taglio contestuale</span>
                  </label>
                  <select
                    aria-label={`Giocatore da tagliare dallo slot ${contextualSlotLabel(step.slot)}`}
                    value={decision.kind === "cut" ? decision.playerName : ""}
                    disabled={decision.kind !== "cut"}
                    onChange={(event) => replaceDecision(index, { kind: "cut", playerName: event.target.value, destinationSlot: "" })}
                  >
                    <option value="">Seleziona il giocatore</option>
                    {step.cutCandidates.map((candidate) => <option value={candidate.name} key={candidate.name}>{candidate.name}</option>)}
                  </select>
                </div>
              )}

              {step.promotionCandidates.length > 0 && (
                <div className={`contextual-slot-choice promotion${decision.kind === "promote" ? " selected" : ""}`}>
                  <label className="contextual-slot-radio">
                    <input
                      type="radio"
                      name={`slot-resolution-${index}`}
                      checked={decision.kind === "promote"}
                      onChange={() => replaceDecision(index, { kind: "promote", playerName: "", destinationSlot: "" })}
                    />
                    <span>Promozione contestuale</span>
                  </label>
                  <select
                    aria-label={`Giocatore da promuovere dallo slot ${contextualSlotLabel(step.slot)}`}
                    value={decision.kind === "promote" ? decision.playerName : ""}
                    disabled={decision.kind !== "promote"}
                    onChange={(event) => {
                      const candidate = step.promotionCandidates.find((item) => item.name === event.target.value);
                      replaceDecision(index, {
                        kind: "promote",
                        playerName: event.target.value,
                        destinationSlot: candidate?.promotionDestinations[0] ?? "",
                      });
                    }}
                  >
                    <option value="">Seleziona il giocatore</option>
                    {step.promotionCandidates.map((candidate) => <option value={candidate.name} key={candidate.name}>{candidate.name}</option>)}
                  </select>
                  <select
                    aria-label="Slot di destinazione della promozione"
                    value={decision.kind === "promote" ? decision.destinationSlot : ""}
                    disabled={decision.kind !== "promote" || !promotionPlayer}
                    onChange={(event) => replaceDecision(index, {
                      ...decision,
                      destinationSlot: event.target.value as ContextualSlotDecision["destinationSlot"],
                    })}
                  >
                    <option value="">Slot di destinazione</option>
                    {(promotionPlayer?.promotionDestinations ?? []).map((destination) => (
                      <option value={destination} key={destination}>{contextualSlotLabel(destination)}</option>
                    ))}
                  </select>
                </div>
              )}
            </fieldset>
          );
        })}
      </div>
      {!resolution.complete && !resolution.errors.length && <small>Completa questa sequenza per rendere disponibili tutti gli slot necessari.</small>}
      {resolution.errors.map((error) => <p className="validation error" key={error}>{error}</p>)}
    </section>
  );
}
