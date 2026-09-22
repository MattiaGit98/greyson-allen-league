import { hasReachedMoment, type LeagueMoment } from "./league-moments";

export function showPlayerListRealTeam(status: "offseason" | "published", moment: LeagueMoment) {
  return status === "published" && !hasReachedMoment(moment, "auction_completed");
}
