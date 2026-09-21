import type { RosterEntry } from "./league-types";

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
