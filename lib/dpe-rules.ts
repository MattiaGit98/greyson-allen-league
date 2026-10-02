import type { RosterEntry } from "./league-types";
import { hasReachedMoment, type LeagueMoment } from "./league-moments";
import { previousSeasonName } from "./season-time";

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

export function shouldShowDpeBadge(entry: Pick<RosterEntry, "state" | "dpeAppliedSeasons">, seasonName: string, leagueMoment: LeagueMoment) {
  if (entry.state !== "active") return false;
  const appliedSeasons = entry.dpeAppliedSeasons ?? [];
  if (appliedSeasons.includes(seasonName)) return true;
  return !hasReachedMoment(leagueMoment, "auction_start")
    && appliedSeasons.includes(previousSeasonName(seasonName));
}
