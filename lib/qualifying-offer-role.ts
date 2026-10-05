import type { PlayerListEntry, QualifyingOfferRight } from "./league-types";

export function qualifyingOfferDisplayRole(
  right: QualifyingOfferRight,
  playerList: readonly PlayerListEntry[],
  playerListPublished: boolean,
): PlayerListEntry["role"] {
  const normalizedName = normalizePlayerName(right.playerName);
  const listedRole = playerList.find((player) => normalizePlayerName(player.name) === normalizedName)?.role;
  return (playerListPublished ? listedRole : right.role ?? listedRole) ?? "X";
}

function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}
