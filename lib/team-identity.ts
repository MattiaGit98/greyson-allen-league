import type { EditableLeagueState } from "./league-state";
import type { DraftAsset } from "./league-types";
import type { HistoryCompetitionEntry } from "./history-competitions";
import { nextDraftYear } from "./draft-positions";
import { synchronizeUnassignedDraftOwners } from "./draft-history";

export function renameTeamIdentity(
  state: EditableLeagueState,
  originalCode: string,
  code: string,
  name: string,
  owner: string,
): EditableLeagueState {
  const replaceCode = (value: string) => value === originalCode ? code : value;
  const replaceCodeTokens = (value: string) => value.replace(/\b[A-Z]{3}\b/g, replaceCode);
  const replaceAgreementCode = (value: string) => value.split(":").map(replaceCode).join(":");

  return {
    ...state,
    teams: state.teams.map((team) => team.code === originalCode
      ? { ...team, code, name, owner, slug: code.toLocaleLowerCase("it") }
      : team),
    rosterEntries: state.rosterEntries.map((entry) => ({ ...entry, teamCode: replaceCode(entry.teamCode) })),
    draftAssets: state.draftAssets.map((asset) => ({
      ...asset,
      teamCode: replaceCode(asset.teamCode),
      originTeamCode: asset.originTeamCode ? replaceCode(asset.originTeamCode) : asset.originTeamCode,
      originOrOverall: typeof asset.originOrOverall === "string" ? replaceCode(asset.originOrOverall) : asset.originOrOverall,
      label: replaceCodeTokens(asset.label),
      clauseResolution: asset.clauseResolution ? {
        ...asset.clauseResolution,
        agreementId: replaceAgreementCode(asset.clauseResolution.agreementId),
        subjectOriginTeamCode: replaceCode(asset.clauseResolution.subjectOriginTeamCode),
        counterpartOriginTeamCode: replaceCode(asset.clauseResolution.counterpartOriginTeamCode),
        originalOwnerTeamCode: replaceCode(asset.clauseResolution.originalOwnerTeamCode),
      } : asset.clauseResolution,
    })),
    qualifyingOfferRights: state.qualifyingOfferRights.map((right) => ({ ...right, teamCode: replaceCode(right.teamCode) })),
    draftOrders: state.draftOrders?.map((assignment) => ({ ...assignment, originTeamCode: replaceCode(assignment.originTeamCode) })),
  };
}

export function replaceTeamCodeInContent(value: unknown, previous: string, next: string): unknown {
  if (value === previous) return next;
  if (Array.isArray(value)) return value.map((item) => replaceTeamCodeInContent(item, previous, next));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => (
    [key === previous ? next : key, replaceTeamCodeInContent(item, previous, next)]
  )));
}

export function renameOpenDraftHistory(
  entries: HistoryCompetitionEntry[],
  draftAssets: DraftAsset[],
  previousCode: string,
  nextCode: string,
) {
  const openYear = nextDraftYear(draftAssets);
  if (openYear === null) return { entries, changed: false };
  let changed = false;
  const renamed = entries.map((entry) => {
    const year = Number(entry.season);
    if (!Number.isInteger(year) || year < openYear || entry.content.kind !== "draft") return entry;
    const rows = entry.content.rows.map((row) => {
      if (row.team !== previousCode) return row;
      changed = true;
      return { ...row, team: nextCode };
    });
    return { ...entry, content: { ...entry.content, rows } };
  });
  const synchronized = synchronizeUnassignedDraftOwners(renamed, draftAssets, [openYear]);
  return { entries: synchronized.entries, changed: changed || synchronized.changed };
}
