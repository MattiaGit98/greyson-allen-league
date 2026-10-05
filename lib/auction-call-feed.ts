import type { PlayerListEntry } from "./league-types";

export type AuctionCallFeedRow = {
  id: unknown;
  created_at: unknown;
  auction_player_name: unknown;
  auction_team_code: unknown;
  auction_cost: unknown;
  auction_role: unknown;
};

export type RecentAuctionCall = {
  id: string;
  playerName: string;
  role: PlayerListEntry["role"];
  cost: number;
  teamCode: string;
  createdAt: string;
};

export function recentAuctionCallsFromFeed(
  rowsNewestFirst: readonly AuctionCallFeedRow[],
  playerList: readonly PlayerListEntry[],
): RecentAuctionCall[] {
  const rolesByName = new Map(playerList.map((player) => [normalizePlayerName(player.name), player.role]));
  return rowsNewestFirst.flatMap((row) => {
    const id = typeof row.id === "string" ? row.id : "";
    const playerName = typeof row.auction_player_name === "string" ? row.auction_player_name.trim() : "";
    const teamCode = typeof row.auction_team_code === "string" ? row.auction_team_code.trim().toUpperCase() : "";
    const createdAt = typeof row.created_at === "string" ? row.created_at : "";
    const cost = typeof row.auction_cost === "number" ? row.auction_cost : Number(row.auction_cost);
    const storedRole = isRole(row.auction_role) ? row.auction_role : undefined;
    if (!id || !playerName || !teamCode || !createdAt || !Number.isSafeInteger(cost) || cost < 0) return [];
    return [{
      id,
      playerName,
      teamCode,
      cost,
      createdAt,
      role: rolesByName.get(normalizePlayerName(playerName)) ?? storedRole ?? "X",
    }];
  }).reverse();
}

function isRole(value: unknown): value is PlayerListEntry["role"] {
  return value === "G" || value === "A" || value === "C" || value === "X";
}

function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}
