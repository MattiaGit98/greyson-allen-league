import type { EditableLeagueState } from "./league-state";
import type { LeagueMoment } from "./league-moments";
import { dpeCountsForRoleMinimums } from "./role-minimums";

export type RoleMinimumAlert = {
  teamCode: string;
  teamName: string;
  counts: { G: number; A: number; C: number };
  missing: { G: number; A: number; C: number };
};

export function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}

export function buildRoleMinimumAlerts(state: EditableLeagueState, moment?: LeagueMoment): RoleMinimumAlert[] {
  if (state.playerListStatus !== "published") return [];
  const roles = new Map(
    state.playerList.map((player) => [normalizePlayerName(player.name), player.role]),
  );

  return state.teams.flatMap((team) => {
    const counts = state.rosterEntries
      .filter((entry) => (
        entry.teamCode === team.code
        && entry.state === "active"
        && (entry.slot !== "dpe" || dpeCountsForRoleMinimums(moment))
      ))
      .reduce((result, entry) => {
        const role = roles.get(normalizePlayerName(entry.name));
        if (role === "G" || role === "A" || role === "C") result[role] += 1;
        return result;
      }, { G: 0, A: 0, C: 0 });
    const missing = {
      G: Math.max(0, 5 - counts.G),
      A: Math.max(0, 5 - counts.A),
      C: Math.max(0, 3 - counts.C),
    };
    return missing.G || missing.A || missing.C
      ? [{ teamCode: team.code, teamName: team.name, counts, missing }]
      : [];
  });
}
