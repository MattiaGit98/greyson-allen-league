import type { EditableLeagueState } from "./league-state";

/** I tagli non sono un roster ai fini del listone. */
export function removeRolelessPlayersLeavingRosters(
  before: EditableLeagueState,
  after: EditableLeagueState,
): EditableLeagueState {
  return removeRolelessPlayersByName(after, rolelessNamesLeavingRoster(before, after));
}

export function removeRolelessPlayersByName(state: EditableLeagueState, names: Iterable<string>): EditableLeagueState {
  const removedNames = new Set([...names].map(normalizedName));
  if (!removedNames.size) return state;
  const playerList = state.playerList.filter((player) => (
    player.role !== "X" || !removedNames.has(normalizedName(player.name))
  ));
  return playerList.length === state.playerList.length ? state : { ...state, playerList };
}

export function rolelessNamesLeavingRoster(before: EditableLeagueState, after: EditableLeagueState) {
  const rolelessNames = new Set(before.playerList
    .filter((player) => player.role === "X")
    .map((player) => normalizedName(player.name)));
  const activeAfter = new Set(after.rosterEntries
    .filter((entry) => entry.state === "active")
    .map((entry) => normalizedName(entry.name)));
  return before.rosterEntries
    .filter((entry) => entry.state === "active" && rolelessNames.has(normalizedName(entry.name)))
    .map((entry) => normalizedName(entry.name))
    .filter((name) => !activeAfter.has(name));
}

function normalizedName(value: string) {
  return value.trim().toLocaleLowerCase("it-IT");
}
