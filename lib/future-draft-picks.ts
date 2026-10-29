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

export function publicDraftCondition(label: string) {
  const counterparty = label.match(/^C\.p\. se 1a (\d{4}) ([A-Z]+) in top 5$/i);
  if (counterparty) {
    return `Contropartita se la 1ª scelta ${counterparty[1]} ${counterparty[2]} rientra in top 5`;
  }
  const protectedPick = label.match(/^Protetta top 5, 1a (\d{4}) ([A-Z]+)$/i);
  if (protectedPick) {
    return `Protetta top 5; contropartita: 1ª scelta ${protectedPick[1]} ${protectedPick[2]}`;
  }
  const swapSubject = label.match(/^Soggetta a dir swap con ([A-Z]+)$/i);
  if (swapSubject) return `Subisce il diritto di swap con ${swapSubject[1]}`;
  const swapRight = label.match(/^Diritto di swap con ([A-Z]+)$/i);
  if (swapRight) return `Diritto di swap con ${swapRight[1]}`;
  return "—";
}

export function hasVisibleFourthDraftClause(asset: DraftAsset) {
  return Boolean(asset.clauseResolution) || publicDraftCondition(asset.label) !== "—";
}
