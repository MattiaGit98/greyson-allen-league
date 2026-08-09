import { requireActiveSeason } from "@/lib/active-season";
import { loadEditableLeagueState } from "@/lib/league-state";
import { shouldCountTeamOptions } from "@/lib/season-time";
import { leagueMomentFromSeason } from "@/lib/league-moments";
import { RosterCorrectionPanel } from "./roster-correction-panel";

export default async function RosterCorrectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const [query, activeSeason, state] = await Promise.all([
    searchParams,
    requireActiveSeason(),
    loadEditableLeagueState(),
  ]);
  const officialRoles = new Map(state.playerList.map((player) => [normalizePlayerName(player.name), player.role]));
  const entries = state.rosterEntries.map((entry, sourceIndex) => {
    const officialRole = officialRoles.get(normalizePlayerName(entry.name));
    return {
      ...entry,
      sourceIndex,
      role: officialRole && officialRole !== "X" ? officialRole : entry.role,
    };
  });
  const activePlayers = new Set(state.rosterEntries
    .filter((entry) => entry.state === "active")
    .map((entry) => normalizePlayerName(entry.name)));
  const qualifyingPlayers = new Set(state.qualifyingOfferRights.map((right) => normalizePlayerName(right.playerName)));
  const freeAgents = state.playerList.filter((player) => {
    const name = normalizePlayerName(player.name);
    return player.role !== "X" && !activePlayers.has(name) && !qualifyingPlayers.has(name);
  });

  return (
    <section className="section page-top admin-dashboard roster-correction-page">
      {query.updated && <p className="notice success">Rettifiche registrate: {query.updated}.</p>}
      {query.error && <p className="notice error">Salvataggio non riuscito: {query.error}</p>}
      <RosterCorrectionPanel
        teams={state.teams.map((team) => ({ code: team.code, name: team.name }))}
        entries={entries}
        freeAgents={freeAgents}
        seasonName={activeSeason.season.name}
        phase={activeSeason.season.status}
        leagueMoment={leagueMomentFromSeason(activeSeason.season)}
        countTeamOptions={shouldCountTeamOptions(
          activeSeason.season.status,
          activeSeason.season.team_options_resolved,
        )}
      />
    </section>
  );
}

function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}
