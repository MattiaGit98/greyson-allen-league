import { PlayerExplorer } from "./player-explorer";
import { loadEditableLeagueState } from "@/lib/league-state";
import { requireActiveSeason } from "@/lib/active-season";
import { hasReachedMoment, leagueMomentFromSeason } from "@/lib/league-moments";

export default async function PlayersPage() {
  const [leagueState, activeSeason] = await Promise.all([
    loadEditableLeagueState(),
    requireActiveSeason(),
  ]);
  const showEligibility = !hasReachedMoment(leagueMomentFromSeason(activeSeason.season), "contract_delivery");
  const rows = leagueState.playerList.map((player, index) => {
    const activeRoster = leagueState.rosterEntries.find((entry) => entry.name === player.name && entry.state === "active");
    const qualifyingOffer = leagueState.qualifyingOfferRights.find((right) => right.playerName === player.name);
    return {
      ...player,
      listOrder: index + 1,
      rosterTeamCode: activeRoster?.teamCode ?? null,
      qualifyingTeamCode: activeRoster ? null : qualifyingOffer?.teamCode ?? null,
    };
  });
  return (
    <section className="section players-page">
      {leagueState.playerListStatus !== "published" && (
        <p className="player-list-provisional-notice">Listone ufficiale per la prossima stagione non ancora pubblicato.</p>
      )}
      <PlayerExplorer
        rows={rows}
        showRealTeam={leagueState.playerListStatus === "published"}
        showEligibility={showEligibility}
      />
    </section>
  );
}
