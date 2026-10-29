import type { RosterEntry } from "./league-types";
import { hasReachedMoment, operationWindows, type LeagueMoment } from "./league-moments";
import { previousSeasonName } from "./season-time";

export const dpeRequirementsConfirmation = "Ho verificato che, per infortunio, squalifica o cause giudiziarie, secondo NBC Sports Edge il giocatore abbia un'alta probabilità di saltare, a partire da ora, almeno tante giornate Dunkest quante quelle comprese tra l'inizio della regular season e la trade deadline; se il calendario della lega non è ancora ufficializzato, almeno 25 partite NBA";

type CurrentDpe = Pick<RosterEntry, "state" | "slot" | "dpeActivatedAfterDeadline">;

export function canReintegrateDpe(entry: CurrentDpe, moment: LeagueMoment) {
  return entry.state === "active" && entry.slot === "dpe"
    && entry.dpeActivatedAfterDeadline !== true
    && operationWindows.dpeReintegration(moment);
}

export function shouldShowDpeNoReintegrationBadge(entry: CurrentDpe, moment: LeagueMoment) {
  return entry.state === "active" && entry.slot === "dpe"
    && entry.dpeActivatedAfterDeadline === true
    && hasReachedMoment(moment, "trade_deadline")
    && !hasReachedMoment(moment, "free_agency_end");
}

export function entriesForDpeAdjustedCap<T extends Pick<RosterEntry, "state" | "slot">>(entries: T[], seasonDistance: number) {
  return entries.filter((entry) => (
    seasonDistance !== 0 || entry.state !== "active" || entry.slot !== "dpe"
  ));
}

export function inheritedDpeSeasons(entries: RosterEntry[], playerName: string) {
  const normalizedName = playerName.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
  return [...new Set(entries
    .filter((entry) => entry.name.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT") === normalizedName)
    .flatMap((entry) => entry.dpeAppliedSeasons ?? []))];
}

export function shouldShowDpeBadge(entry: Pick<RosterEntry, "state" | "dpeSeasonEndReintegratedSeasons">, seasonName: string, leagueMoment: LeagueMoment) {
  if (entry.state !== "active") return false;
  return !hasReachedMoment(leagueMoment, "auction_start")
    && (entry.dpeSeasonEndReintegratedSeasons?.includes(previousSeasonName(seasonName)) ?? false);
}
