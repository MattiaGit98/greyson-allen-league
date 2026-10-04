import type { EditableLeagueState } from "./league-state";
import { numberPublicAvailablePlayers } from "./player-list-public-order";

export type PublicPlayerListRow = {
  name: string;
  role: "G" | "A" | "C" | "X";
  realTeam: string;
  rookie: boolean;
  under23: boolean;
  listOrder: number;
  publicOrder: number | null;
  rosterTeamCode: string | null;
  qualifyingTeamCode: string | null;
  buyoutApplied: boolean;
};

export function buildPublicPlayerListRows(
  state: Pick<EditableLeagueState, "playerList" | "rosterEntries" | "qualifyingOfferRights">,
): PublicPlayerListRow[] {
  return numberPublicAvailablePlayers(state.playerList.map((player, index) => {
    const normalizedName = normalizePlayerName(player.name);
    const activeRoster = state.rosterEntries.find((entry) => (
      normalizePlayerName(entry.name) === normalizedName && entry.state === "active"
    ));
    const qualifyingOffer = state.qualifyingOfferRights.find((right) => (
      normalizePlayerName(right.playerName) === normalizedName
    ));
    const buyoutApplied = state.rosterEntries.some((entry) => (
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
  }));
}

function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}
