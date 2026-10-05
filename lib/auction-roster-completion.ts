import type { EditableLeagueState } from "./league-state";

export type IncompleteAuctionRoster = {
  teamCode: string;
  regularPlayers: number;
};

export function incompleteAuctionRosters(state: EditableLeagueState): IncompleteAuctionRoster[] {
  return state.teams.flatMap((team) => {
    const regularPlayers = state.rosterEntries.filter((entry) => (
      entry.teamCode === team.code
      && entry.state === "active"
      && entry.slot === "regular"
    )).length;

    return regularPlayers < 13 ? [{ teamCode: team.code, regularPlayers }] : [];
  });
}

export function incompleteAuctionRosterLabels(state: EditableLeagueState) {
  return incompleteAuctionRosters(state).map(({ teamCode, regularPlayers }) => (
    `${teamCode}: ${regularPlayers}/13 slot roster occupati`
  ));
}
