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
  const showPreAuctionDetails = !hasReachedMoment(moment, "auction_completed");
  const showRealTeam = showPlayerListRealTeam(leagueState.playerListStatus, moment);
  const showOrder = showPreAuctionDetails;
  const showPendingFilter = !showPreAuctionDetails && !hasReachedMoment(moment, "contract_delivery");
  const rows = buildPublicPlayerListRows(leagueState);
  return (
    <section className="section players-page">
      {leagueState.playerListStatus !== "published" && (
        <p className="player-list-provisional-notice">Listone ufficiale per la prossima stagione non ancora pubblicato.</p>
      )}
      <PlayerExplorer
        key={showPreAuctionDetails ? "pre-auction" : showPendingFilter ? "post-auction" : "contracts-delivered"}
        rows={rows}
        seasonName={activeSeason.season.name}
        postAuction={!showPreAuctionDetails}
        showPendingFilter={showPendingFilter}
        showOrder={showOrder}
        showRealTeam={showRealTeam}
        showEligibility={showPreAuctionDetails}
        showQualifyingOfferFilter={showPreAuctionDetails}
      />
    </section>
  );
}
