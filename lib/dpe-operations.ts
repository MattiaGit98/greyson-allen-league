import type { RosterEntry } from "./league-types";
import type { LeagueMoment } from "./league-moments";
import { applyContextualContractCut, type StretchYears } from "./stretch-provision";

export function applyDpeActivationWithOptionalCut(input: {
  rosterEntries: RosterEntry[];
  teamCode: string;
  playerName: string;
  expectedCutPlayerName?: string | null;
  cutStretchYears?: StretchYears | null;
  seasonName: string;
  currentSeasonEndYear: number;
  leagueMoment: LeagueMoment;
}) {
  const targetIndex = input.rosterEntries.findIndex((entry) => (
    entry.teamCode === input.teamCode
    && entry.name === input.playerName
    && entry.state === "active"
  ));
  const target = input.rosterEntries[targetIndex];
  if (!target) throw new Error("Il giocatore non appartiene più al roster selezionato.");
  if (target.slot === "dpe") throw new Error("Il giocatore è già nella DPE.");

  const occupiedDpe = input.rosterEntries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.teamCode === input.teamCode && entry.state === "active" && entry.slot === "dpe");
  if (occupiedDpe.length > 1) throw new Error("La squadra presenta più di un giocatore nello slot DPE: correggi prima il roster.");

  const incumbent = occupiedDpe[0] ?? null;
  if (incumbent && input.expectedCutPlayerName !== incumbent.entry.name) {
    throw new Error(`Per esercitare la DPE devi confermare il taglio contestuale di ${incumbent.entry.name}.`);
  }
  if (!incumbent && input.expectedCutPlayerName) {
    throw new Error("Lo slot DPE è cambiato: aggiorna la pagina e ripeti l’operazione.");
  }
  if (!incumbent && input.cutStretchYears != null) throw new Error("Non c'è un giocatore DPE da tagliare con stretch provision.");

  const rosterEntries = input.rosterEntries.map((entry, index) => {
    if (index === targetIndex) {
      return {
        ...entry,
        slot: "dpe" as const,
        dpeAppliedSeasons: [...new Set([...(entry.dpeAppliedSeasons ?? []), input.seasonName])],
      };
    }
    if (incumbent && index === incumbent.index) {
      return applyContextualContractCut(entry, input.currentSeasonEndYear, input.leagueMoment, input.cutStretchYears ?? null);
    }
    return entry;
  });

  return {
    rosterEntries,
    cutPlayer: incumbent?.entry ?? null,
  };
}
