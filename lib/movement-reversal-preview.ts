import type { EditableLeagueState } from "./league-state";
import type { LeagueMoment } from "./league-moments";
import { countActiveRosterSlots } from "./roster-slot-limits";
import { calculateCapSpace, followingSeasonName } from "./season-time";
import { entriesForDpeAdjustedCap } from "./dpe-rules";
import { dpeCountsForRoleMinimums } from "./role-minimums";

export function movementReversalPreview({
  current,
  restored,
  seasonName,
  countTeamOptions,
  currentMoment,
}: {
  current: EditableLeagueState;
  restored: EditableLeagueState;
  seasonName: string;
  countTeamOptions: boolean;
  currentMoment: LeagueMoment;
}) {
  const seasonNames = [0, 1, 2].map((distance) => followingSeasonName(seasonName, distance));
  const teamCodes = new Set([...current.teams, ...restored.teams].map((team) => team.code));
  return [...teamCodes].flatMap((teamCode) => {
    if (teamSnapshot(current, teamCode) === teamSnapshot(restored, teamCode)) return [];
    const entries = restored.rosterEntries.filter((entry) => entry.teamCode === teamCode);
    const currentEntries = current.rosterEntries.filter((entry) => entry.teamCode === teamCode);
    const team = restored.teams.find((item) => item.code === teamCode) ?? current.teams.find((item) => item.code === teamCode);
    return [{
      code: teamCode,
      name: team?.name ?? teamCode,
      slotsBefore: countActiveRosterSlots(current.rosterEntries, teamCode),
      slotsAfter: countActiveRosterSlots(restored.rosterEntries, teamCode),
      rolesBefore: countRoles(currentEntries, currentMoment),
      rolesAfter: countRoles(entries, currentMoment),
      capSpaces: seasonNames.map((targetSeason, distance) => ({
        seasonName: targetSeason,
        before: calculateCapSpace({
          entries: entriesForDpeAdjustedCap(currentEntries, distance),
          seasonName: targetSeason,
          optionSeasonName: seasonName,
          countTeamOptions,
        }),
        after: calculateCapSpace({
          entries: entriesForDpeAdjustedCap(entries, distance),
          seasonName: targetSeason,
          optionSeasonName: seasonName,
          countTeamOptions,
        }),
      })),
    }];
  });
}

function countRoles(entries: EditableLeagueState["rosterEntries"], currentMoment: LeagueMoment) {
  return entries
    .filter((entry) => entry.state === "active" && (entry.slot !== "dpe" || dpeCountsForRoleMinimums(currentMoment)))
    .reduce((roles, entry) => {
      if (entry.role) roles[entry.role] += 1;
      return roles;
    }, { G: 0, A: 0, C: 0 });
}

function teamSnapshot(state: EditableLeagueState, teamCode: string) {
  const normalized = <T,>(rows: T[]) => rows.map((row) => JSON.stringify(row)).sort();
  return JSON.stringify({
    roster: normalized(state.rosterEntries.filter((entry) => entry.teamCode === teamCode)),
    picks: normalized(state.draftAssets.filter((pick) => pick.teamCode === teamCode)),
    qualifyingOffers: normalized(state.qualifyingOfferRights.filter((right) => right.teamCode === teamCode)),
  });
}
