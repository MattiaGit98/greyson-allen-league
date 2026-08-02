import type { EditableLeagueState } from "./league-state";

export type MissingPlayerListEntry = {
  playerName: string;
  teamCodes: string[];
};

export type RoleMinimumAlert = {
  teamCode: string;
  teamName: string;
  counts: { G: number; A: number; C: number };
  missing: { G: number; A: number; C: number };
};

export function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}

export function findRosterPlayersMissingFromOfficialList(
  state: EditableLeagueState,
): MissingPlayerListEntry[] {
  if (state.playerListStatus !== "published") return [];
  const listed = new Set(state.playerList.map((player) => normalizePlayerName(player.name)));
  const missing = new Map<string, MissingPlayerListEntry>();

  for (const entry of state.rosterEntries) {
    const normalized = normalizePlayerName(entry.name);
    if (!normalized || listed.has(normalized)) continue;
    const current = missing.get(normalized) ?? { playerName: entry.name, teamCodes: [] };
    if (!current.teamCodes.includes(entry.teamCode)) current.teamCodes.push(entry.teamCode);
    missing.set(normalized, current);
  }

  return [...missing.values()]
    .map((entry) => ({ ...entry, teamCodes: entry.teamCodes.sort((a, b) => a.localeCompare(b, "it")) }))
    .sort((a, b) => a.playerName.localeCompare(b.playerName, "it"));
}

export function buildRoleMinimumAlerts(state: EditableLeagueState): RoleMinimumAlert[] {
  if (state.playerListStatus !== "published") return [];
  const roles = new Map(
    state.playerList.map((player) => [normalizePlayerName(player.name), player.role]),
  );

  return state.teams.flatMap((team) => {
    const counts = state.rosterEntries
      .filter((entry) => entry.teamCode === team.code && entry.state === "active" && entry.slot !== "dpe")
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
