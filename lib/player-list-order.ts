import type { PlayerListEntry } from "./league-types";

export function orderPlayerListByRole<T extends Pick<PlayerListEntry, "role">>(players: readonly T[]): T[] {
  return [
    ...players.filter((player) => player.role !== "X"),
    ...players.filter((player) => player.role === "X"),
  ];
}

export function movePlayerToRoleBoundary<T extends Pick<PlayerListEntry, "role">>(players: readonly T[], playerIndex: number): T[] {
  const player = players[playerIndex];
  if (!player) return [...players];
  const remaining = players.filter((_, index) => index !== playerIndex);
  if (player.role === "X") return [...remaining, player];
  const firstRolelessIndex = remaining.findIndex((item) => item.role === "X");
  if (firstRolelessIndex < 0) return [...remaining, player];
  return [
    ...remaining.slice(0, firstRolelessIndex),
    player,
    ...remaining.slice(firstRolelessIndex),
  ];
}
