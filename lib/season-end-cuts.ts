import type { LeagueMoment } from "./league-moments";
import type { RosterEntry } from "./league-types";

export function shouldShowScheduledCutBadge(
  entry: Pick<RosterEntry, "state" | "scheduledSeasonEndCut">,
  seasonName: string,
  leagueMoment: LeagueMoment,
) {
  return entry.state === "active"
    && entry.scheduledSeasonEndCut === seasonName
    && leagueMoment === "free_agency_reopening";
}
