import { nextDraftYear } from "./draft-positions";
import type { DraftAsset, TeamSummary } from "./league-types";

export function fourthDraftYear(draftAssets: DraftAsset[]) {
  const firstYear = nextDraftYear(draftAssets);
  return firstYear === null ? null : firstYear + 3;
}

export function futureDraftPickId(year: number, round: string, originTeamCode: string) {
  const roundCode = round.trim().startsWith("1") ? "1" : "2";
  return `future-pick:${year}:${roundCode}:${originTeamCode}`;
}

export function fourthDraftVirtualPicks(draftAssets: DraftAsset[], teams: TeamSummary[]): Array<DraftAsset & { id: string; virtual: true }> {
  const year = fourthDraftYear(draftAssets);
  if (year === null) return [];
  const rounds = ["1° giro", "2° giro"];
  return teams.flatMap((team) => rounds.flatMap((round) => {
    const exists = draftAssets.some((asset) => (
      asset.year === year
      && asset.round === round
      && !asset.isBonus
      && draftOriginTeamCode(asset) === team.code
    ));
    if (exists) return [];
    return [{
      id: futureDraftPickId(year, round, team.code),
      label: "Scelta",
      round,
      year,
      originOrOverall: team.code,
      originTeamCode: team.code,
      isBonus: false,
      teamCode: team.code,
      virtual: true,
    }];
  }));
}

export function materializeFourthDraftPicks(
  draftAssets: DraftAsset[],
  teams: TeamSummary[],
  requestedIds: Iterable<string>,
) {
  const requested = new Set(requestedIds);
  const virtual = fourthDraftVirtualPicks(draftAssets, teams);
  const additions = virtual
    .filter((pick) => requested.has(pick.id))
    .map(({ id: _id, virtual: _virtual, ...asset }) => asset);
  return additions.length ? [...draftAssets, ...additions] : draftAssets;
}

export function isFourthDraftPick(asset: DraftAsset, draftAssets: DraftAsset[]) {
  return asset.year === fourthDraftYear(draftAssets) && !asset.isBonus;
}

export function countTradeEligibleDraftAssets(draftAssets: DraftAsset[], teamCode: string) {
  const firstYear = nextDraftYear(draftAssets);
  if (firstYear === null) return 0;
  return draftAssets.filter((asset) => asset.teamCode === teamCode && asset.year <= firstYear + 2).length;
}

function draftOriginTeamCode(asset: DraftAsset) {
  if (asset.originTeamCode) return asset.originTeamCode;
  return typeof asset.originOrOverall === "string" ? asset.originOrOverall : null;
}
