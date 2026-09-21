import type { EditableLeagueState } from "./league-state";

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
