import type { LeagueTransition } from "./league-moments";

export type LeagueTransitionHistoryConfirmation = {
  field: "winner_roster_history_confirmed" | "honours_history_confirmed";
  label: string;
  error: string;
};

export function historyConfirmationForTransition(transition: LeagueTransition): LeagueTransitionHistoryConfirmation | null {
  if (transition === "free_agency_reopening") {
    return {
      field: "winner_roster_history_confirmed",
      label: "Confermo di aver inserito il Roster vincitore nello storico.",
      error: "Conferma di aver inserito il Roster vincitore nello storico prima di avanzare.",
    };
  }
  if (transition === "season_end") {
    return {
      field: "honours_history_confirmed",
      label: "Confermo di aver aggiornato l’Albo d’oro e il Numero titoli nello storico.",
      error: "Conferma di aver aggiornato l’Albo d’oro e il Numero titoli nello storico prima di avanzare.",
    };
  }
  return null;
}
