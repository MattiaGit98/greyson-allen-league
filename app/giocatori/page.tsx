import { PlayerExplorer } from "./player-explorer";
import { loadEditableLeagueState } from "@/lib/league-state";
import { requireActiveSeason } from "@/lib/active-season";
import { hasReachedMoment, leagueMomentFromSeason } from "@/lib/league-moments";
import { normalizePlayerName } from "@/lib/admin-alerts";
import { showPlayerListRealTeam } from "@/lib/player-list-visibility";

export default async function PlayersPage() {
  const [leagueState, activeSeason] = await Promise.all([
    loadEditableLeagueState(),
    requireActiveSeason(),
  ]);
  const moment = leagueMomentFromSeason(activeSeason.season);
  const showEligibility = !hasReachedMoment(moment, "contract_delivery");
  const showRealTeam = showPlayerListRealTeam(leagueState.playerListStatus, moment);
  const rows = leagueState.playerList.map((player, index) => {
    const normalizedName = normalizePlayerName(player.name);
    const activeRoster = leagueState.rosterEntries.find((entry) => normalizePlayerName(entry.name) === normalizedName && entry.state === "active");
    const qualifyingOffer = leagueState.qualifyingOfferRights.find((right) => normalizePlayerName(right.playerName) === normalizedName);
    const buyoutApplied = leagueState.rosterEntries.some((entry) => (
      normalizePlayerName(entry.name) === normalizedName
      && entry.state === "cut"
      && entry.buyoutApplied === true
    ));
    return {
      ...player,
      listOrder: index + 1,
      rosterTeamCode: activeRoster?.teamCode ?? null,
      qualifyingTeamCode: activeRoster ? null : qualifyingOffer?.teamCode ?? null,
      buyoutApplied,
    };
  });
  return (
    <section className="section players-page">
      {leagueState.playerListStatus !== "published" && (
        <p className="player-list-provisional-notice">Listone ufficiale per la prossima stagione non ancora pubblicato.</p>
      )}
      <PlayerExplorer
        rows={rows}
        showRealTeam={showRealTeam}
        showEligibility={showEligibility}
      />
    </section>
  );
}
