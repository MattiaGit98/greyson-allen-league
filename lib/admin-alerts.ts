import type { EditableLeagueState } from "./league-state";
import type { LeagueMoment } from "./league-moments";
import { dpeCountsForRoleMinimums } from "./role-minimums";
import { countRosterRoles, roleMinimumDeficits } from "./rules/roster";

export type RoleMinimumAlert = {
  teamCode: string;
  teamName: string;
  counts: { G: number; A: number; C: number };
  missing: { G: number; A: number; C: number };
};

export function formatRoleMinimumMissing(alert: Pick<RoleMinimumAlert, "missing">) {
  return [
    alert.missing.G ? `${alert.missing.G} G` : "",
    alert.missing.A ? `${alert.missing.A} A` : "",
    alert.missing.C ? `${alert.missing.C} C` : "",
  ].filter(Boolean).join(" - ");
}

export function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}

export function buildRoleMinimumAlerts(state: EditableLeagueState, moment?: LeagueMoment): RoleMinimumAlert[] {
  if (state.playerListStatus !== "published") return [];
  const roles = new Map(
    state.playerList.map((player) => [normalizePlayerName(player.name), player.role]),
  );

  return state.teams.flatMap((team) => {
    const counts = countRosterRoles(state.rosterEntries
      .filter((entry) => entry.teamCode === team.code && entry.state === "active")
      .map((entry) => {
        const role = roles.get(normalizePlayerName(entry.name));
        return {
          slot: entry.slot,
          role: role === "G" || role === "A" || role === "C" ? role : null,
        };
      }), dpeCountsForRoleMinimums(moment));
    const missing = roleMinimumDeficits(counts);
    return missing.G || missing.A || missing.C
      ? [{ teamCode: team.code, teamName: team.name, counts, missing }]
      : [];
  });
}
