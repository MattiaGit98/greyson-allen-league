import { requireActiveSeason } from "@/lib/active-season";
import { loadEditableLeagueState } from "@/lib/league-state";
import { buildPublicLeagueContext } from "@/lib/public-league-context";
import { loadRegulation } from "@/lib/regulation";

export async function loadPublicLeagueContext() {
  const [activeSeason, state, articles] = await Promise.all([
    requireActiveSeason(),
    loadEditableLeagueState(),
    loadRegulation(),
  ]);
  return buildPublicLeagueContext(state, activeSeason.season, articles);
}
