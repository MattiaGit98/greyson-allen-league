import { PlayerExplorer } from "./player-explorer";
import { loadEditableLeagueState } from "@/lib/league-state";

export default async function PlayersPage() {
  const leagueState = await loadEditableLeagueState();
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
      <PlayerExplorer rows={rows} />
    </section>
  );
}
