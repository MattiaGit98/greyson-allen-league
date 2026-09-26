import type { RosterEntry } from "./league-types";

export function requiresPlayoffTeamOptionPromotion(entry: RosterEntry, seasonName: string) {
  return entry.playoffTeamOptionPromotionSeason === seasonName
    && entry.state === "active"
    && (entry.slot === "g_league" || entry.slot === "two_way");
}

export function applyPlayoffTeamOptionPromotion(entry: RosterEntry, seasonName: string): RosterEntry {
  if (!requiresPlayoffTeamOptionPromotion(entry, seasonName)) return entry;
  return {
    ...entry,
    slot: "regular",
    playoffTeamOptionPromotionSeason: undefined,
    twoWayPromotionLocked: true,
  };
}
