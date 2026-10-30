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
  twoWaySlotLimit,
  counts,
  incomingSlot,
  players,
  value,
  onChange,
}: {
  twoWaySlotLimit?: number;
  counts: ContextualSlotCounts;
  incomingSlot: "regular" | "two_way" | "g_league";
  players: ContextualSlotPlayer[];
  value: ContextualSlotDecision[];
  onChange: (value: ContextualSlotDecision[]) => void;
}) {
  const resolution = resolveContextualSlots({ counts, incomingSlot, players, decisions: value, twoWaySlotLimit });
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
          const movedPlayer = step.moveCandidates.find((candidate) => candidate.name === decision.playerName);
          const cutPlayer = step.cutCandidates.find((candidate) => candidate.name === decision.playerName);
          const stretchOptions = cutPlayer?.stretchOptions ?? [];
          const displayedStretchOptions = stretchOptions.length ? stretchOptions : [2, 3];
          return (
            <fieldset className="contextual-slot-step" key={`${index}-${step.slot}`}>
              <legend>
                <b>{index + 1}</b>
                <span>{index === 0 ? "Libera" : "Libera anche"} lo slot {contextualSlotLabel(step.slot)}</span>
              </legend>

              {step.cutCandidates.length > 0 && (
                <div className={`contextual-slot-choice cut${decision.kind === "cut" ? " selected" : ""}`}>
                  <label className="contextual-slot-radio">
                    <input
                      type="radio"
                      name={`slot-resolution-${index}`}
                      checked={decision.kind === "cut"}
                      onChange={() => replaceDecision(index, { kind: "cut", playerName: "", destinationSlot: "", stretchYears: null })}
                    />
                    <span>Taglio contestuale</span>
                  </label>
                  <select
                    aria-label={`Giocatore da tagliare dallo slot ${contextualSlotLabel(step.slot)}`}
                    value={decision.kind === "cut" ? decision.playerName : ""}
                    disabled={decision.kind !== "cut"}
                    onChange={(event) => replaceDecision(index, { kind: "cut", playerName: event.target.value, destinationSlot: "", stretchYears: null })}
                  >
                    <option value="">Seleziona il giocatore</option>
                    {step.cutCandidates.map((candidate) => <option value={candidate.name} key={candidate.name}>{candidate.name}</option>)}
                  </select>
                  <div className="contextual-cut-stretch">
                    <label>
                      <input
                        type="checkbox"
                        checked={decision.kind === "cut" && decision.stretchYears != null}
                        disabled={decision.kind !== "cut" || !stretchOptions.length}
                        onChange={(event) => replaceDecision(index, { ...decision, stretchYears: event.target.checked ? stretchOptions[0] : null })}
                      />
                      Stretch provision
                    </label>
                    <select
                      aria-label={`Durata stretch provision per ${decision.playerName || "il giocatore da tagliare"}`}
                      value={decision.kind === "cut" ? decision.stretchYears ?? displayedStretchOptions[0] : displayedStretchOptions[0]}
                      disabled={decision.kind !== "cut" || !stretchOptions.length || decision.stretchYears == null}
                      onChange={(event) => replaceDecision(index, { ...decision, stretchYears: Number(event.target.value) as 2 | 3 })}
                    >
                      {displayedStretchOptions.map((years) => <option value={years} key={years}>{years} anni</option>)}
                    </select>
                  </div>
                </div>
              )}

              {step.freeReleaseCandidates.length > 0 && (
                <div className={`contextual-slot-choice${decision.kind === "free_release" ? " selected" : ""}`}>
                  <label className="contextual-slot-radio">
                    <input
                      type="radio"
                      name={`slot-resolution-${index}`}
                      checked={decision.kind === "free_release"}
                      onChange={() => replaceDecision(index, { kind: "free_release", playerName: "", destinationSlot: "" })}
                    />
                    <span>Rilascio gratuito</span>
                  </label>
                  <select
                    aria-label={`Giocatore da rilasciare gratuitamente dallo slot ${contextualSlotLabel(step.slot)}`}
                    value={decision.kind === "free_release" ? decision.playerName : ""}
                    disabled={decision.kind !== "free_release"}
                    onChange={(event) => replaceDecision(index, { kind: "free_release", playerName: event.target.value, destinationSlot: "" })}
                  >
                    <option value="">Seleziona il giocatore</option>
                    {step.freeReleaseCandidates.map((candidate) => <option value={candidate.name} key={candidate.name}>{candidate.name}</option>)}
                  </select>
                </div>
              )}

              {step.moveCandidates.length > 0 && (
                <div className={`contextual-slot-choice movement${decision.kind === "move" ? " selected" : ""}`}>
                  <label className="contextual-slot-radio">
                    <input
                      type="radio"
                      name={`slot-resolution-${index}`}
                      checked={decision.kind === "move"}
                      onChange={() => replaceDecision(index, { kind: "move", playerName: "", destinationSlot: "" })}
                    />
                    <span>Spostamento contestuale</span>
                  </label>
                  <select
                    aria-label={`Giocatore da spostare dallo slot ${contextualSlotLabel(step.slot)}`}
                    value={decision.kind === "move" ? decision.playerName : ""}
                    disabled={decision.kind !== "move"}
                    onChange={(event) => {
                      const candidate = step.moveCandidates.find((item) => item.name === event.target.value);
                      replaceDecision(index, {
                        kind: "move",
                        playerName: event.target.value,
                        destinationSlot: candidate?.moveDestinations[0] ?? "",
                      });
                    }}
                  >
                    <option value="">Seleziona il giocatore</option>
                    {step.moveCandidates.map((candidate) => <option value={candidate.name} key={candidate.name}>{candidate.name}</option>)}
                  </select>
                  <select
                    aria-label="Slot di destinazione dello spostamento"
                    value={decision.kind === "move" ? decision.destinationSlot : ""}
                    disabled={decision.kind !== "move" || !movedPlayer}
                    onChange={(event) => replaceDecision(index, {
                      ...decision,
                      destinationSlot: event.target.value as ContextualSlotDecision["destinationSlot"],
                    })}
                  >
                    <option value="">Slot di destinazione</option>
                    {(movedPlayer?.moveDestinations ?? []).map((destination) => (
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
