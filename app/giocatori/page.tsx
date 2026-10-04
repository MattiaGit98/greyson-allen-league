import { PlayerExplorer } from "./player-explorer";
import { loadEditableLeagueState } from "@/lib/league-state";
import { requireActiveSeason } from "@/lib/active-season";
import { hasReachedMoment, leagueMomentFromSeason } from "@/lib/league-moments";
import { showPlayerListRealTeam } from "@/lib/player-list-visibility";
import { buildPublicPlayerListRows } from "@/lib/public-player-list";

export default async function PlayersPage() {
  const [leagueState, activeSeason] = await Promise.all([
    loadEditableLeagueState(),
    requireActiveSeason(),
  ]);
  const moment = leagueMomentFromSeason(activeSeason.season);
  const showEligibility = !hasReachedMoment(moment, "contract_delivery");
  const showRealTeam = showPlayerListRealTeam(leagueState.playerListStatus, moment);
  const showOrder = !hasReachedMoment(moment, "auction_completed");
  const rows = buildPublicPlayerListRows(leagueState);
  return (
    <section className="section players-page">
      {leagueState.playerListStatus !== "published" && (
        <p className="player-list-provisional-notice">Listone ufficiale per la prossima stagione non ancora pubblicato.</p>
      )}
      <PlayerExplorer
        rows={rows}
        showOrder={showOrder}
        showRealTeam={showRealTeam}
        showEligibility={showEligibility}
      />
    </section>
  );
}
