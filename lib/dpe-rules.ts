import type { RosterEntry } from "./league-types";

export function entriesForDpeAdjustedCap<T extends Pick<RosterEntry, "state" | "slot">>(entries: T[], seasonDistance: number) {
  return entries.filter((entry) => (
    seasonDistance !== 0 || entry.state !== "active" || entry.slot !== "dpe"
  ));
}
