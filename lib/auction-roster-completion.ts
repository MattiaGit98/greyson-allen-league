import type { EditableLeagueState } from "./league-state";
import type { LeagueMoment } from "./league-moments";
import { buildRoleMinimumAlerts } from "./admin-alerts";

export type IncompleteAuctionRoster = {
  teamCode: string;
  signedPlayers: number;
};

export function incompleteAuctionRosters(state: EditableLeagueState): IncompleteAuctionRoster[] {
  return state.teams.flatMap((team) => {
    const signedPlayers = state.rosterEntries.filter((entry) => (
      entry.teamCode === team.code
      && entry.state === "active"
      && entry.slot !== "dpe"
    )).length;

    return signedPlayers < 13 ? [{ teamCode: team.code, signedPlayers }] : [];
  });
}

export function incompleteAuctionRosterLabels(state: EditableLeagueState) {
  return incompleteAuctionRosters(state).map(({ teamCode, signedPlayers }) => (
    `${teamCode}: ${signedPlayers}/13 giocatori firmati`
  ));
}

export function auctionTeamCompletionLabels(state: EditableLeagueState, moment: LeagueMoment) {
  const signedPlayersByTeam = new Map(
    incompleteAuctionRosters(state).map((team) => [team.teamCode, team.signedPlayers]),
  );
  const roleAlertsByTeam = new Map(
    buildRoleMinimumAlerts(state, moment).map((team) => [team.teamCode, team]),
  );

  return state.teams.flatMap((team) => {
    const details: string[] = [];
    const signedPlayers = signedPlayersByTeam.get(team.code);
    if (signedPlayers !== undefined) details.push(`${signedPlayers}/13 giocatori firmati`);

    const roleAlert = roleAlertsByTeam.get(team.code);
    if (roleAlert) {
      const missingRoles = [
        roleAlert.missing.G ? `${roleAlert.missing.G} ${roleAlert.missing.G === 1 ? "guardia" : "guardie"}` : "",
        roleAlert.missing.A ? `${roleAlert.missing.A} ${roleAlert.missing.A === 1 ? "ala" : "ali"}` : "",
        roleAlert.missing.C ? `${roleAlert.missing.C} ${roleAlert.missing.C === 1 ? "centro" : "centri"}` : "",
      ].filter(Boolean);
      const missingTotal = roleAlert.missing.G + roleAlert.missing.A + roleAlert.missing.C;
      details.push(`${missingTotal === 1 ? "manca" : "mancano"} ${missingRoles.join(" · ")}`);
    }

    return details.length ? [`${team.code}: ${details.join(" · ")}`] : [];
  });
}
