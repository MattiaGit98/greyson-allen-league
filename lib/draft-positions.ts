import type { DraftAsset, DraftClauseResolution } from "./league-types";
import { draftOverallPosition } from "./draft-rules";

export type DraftOrderAssignment = {
  position: number;
  originTeamCode: string;
  isBonus: boolean;
  round?: "1° giro" | "2° giro";
};
export type SavedDraftOrderAssignment = DraftOrderAssignment & { year: number };

export function nextDraftYear(draftAssets: DraftAsset[]) {
  if (!draftAssets.length) return null;
  return Math.min(...draftAssets.map((asset) => asset.year));
}

export function defaultDraftPositionCount(draftYear: number, teamCount: number) {
  return teamCount * 2 + (draftYear === 2026 ? 0 : 2);
}

export function yearsWithDefinedDraftPositions(draftAssets: DraftAsset[]) {
  return [...new Set(draftAssets
    .filter((asset) => draftOverallPosition(asset.originOrOverall) !== null)
    .map((asset) => asset.year))]
    .sort((left, right) => left - right);
}

export function highlightedDraftYear(draftAssets: DraftAsset[], configuredYears: number[] = []) {
  if (!draftAssets.length) return null;
  const nextYear = Math.min(...draftAssets.map((asset) => asset.year));
  const positionsDefined = configuredYears.includes(nextYear)
    || draftAssets.some((asset) => asset.year === nextYear && draftOverallPosition(asset.originOrOverall) !== null);
  return positionsDefined ? nextYear : null;
}

export function applyCompleteDraftOrder(
  draftAssets: DraftAsset[],
  draftYear: number,
  assignments: DraftOrderAssignment[],
  teamCodes: string[],
) {
  validateCompleteDraftOrder(assignments, teamCodes, draftYear);
  const positionCount = assignments.length;
  const assetsForYear = draftAssets.filter((asset) => asset.year === draftYear);
  const normalAssets = assetsForYear.filter((asset) => !asset.isBonus);
  const expectedNormalAssets = teamCodes.length * 2;
  if (normalAssets.length !== expectedNormalAssets) {
    throw new Error(`Il Draft ${draftYear} deve contenere ${expectedNormalAssets} scelte ordinarie.`);
  }

  const assetsByOrigin = new Map<string, DraftAsset>();
  for (const asset of normalAssets) {
    let originTeamCode = draftOriginTeamCode(asset, teamCodes);
    if (!originTeamCode && typeof asset.originOrOverall === "number") {
      const assignment = assignments.find((item) => item.position === asset.originOrOverall);
      if (assignment && !assignment.isBonus) originTeamCode = assignment.originTeamCode;
    }
    if (!originTeamCode) throw new Error(`Non è possibile identificare la scelta ${asset.round} di ${asset.teamCode}.`);
    const key = draftOriginKey(asset.round, originTeamCode);
    if (assetsByOrigin.has(key)) throw new Error(`La scelta originaria ${originTeamCode} · ${asset.round} compare più volte.`);
    assetsByOrigin.set(key, { ...asset, originTeamCode, isBonus: false });
  }

  const positionedAssets: DraftAsset[] = assignments.map((assignment) => {
    const round = assignmentRound(assignment, positionCount);
    if (assignment.isBonus) {
      const existingBonus = assetsForYear.find((asset) => asset.isBonus && asset.round === round);
      return {
        ...(existingBonus ?? {
          label: "Scelta",
          year: draftYear,
          round,
        }),
        teamCode: assignment.originTeamCode,
        originOrOverall: assignment.position,
        originTeamCode: assignment.originTeamCode,
        isBonus: true,
      };
    }
    const asset = assetsByOrigin.get(draftOriginKey(round, assignment.originTeamCode));
    if (!asset) throw new Error(`Manca la scelta originaria ${assignment.originTeamCode} · ${round}.`);
    return {
      ...asset,
      originOrOverall: assignment.position,
      originTeamCode: assignment.originTeamCode,
      isBonus: false,
    };
  });

  const positionedState = [
    ...draftAssets.filter((asset) => asset.year !== draftYear),
    ...positionedAssets,
  ];
  const resolution = resolveDraftClauses(positionedState, draftYear, teamCodes);
  return {
    draftAssets: resolution.draftAssets,
    resolvedClauses: resolution.resolvedClauses,
    ownershipChanges: resolution.ownershipChanges,
  };
}

export function validateCompleteDraftOrder(assignments: DraftOrderAssignment[], teamCodes: string[], draftYear?: number) {
  const ordinaryPickCount = teamCodes.length * 2;
  const expectedBonusCount = draftYear === 2026 ? 0 : draftYear === undefined ? assignments.length - ordinaryPickCount : 2;
  const expectedPositionCount = ordinaryPickCount + expectedBonusCount;
  if (draftYear !== undefined && assignments.length !== expectedPositionCount) {
    throw new Error(`Il Draft ${draftYear} deve contenere ${ordinaryPickCount} scelte ordinarie + ${expectedBonusCount} scelte bonus: ${expectedPositionCount} totali.`);
  }
  if (draftYear === undefined && ![ordinaryPickCount, ordinaryPickCount + 2].includes(assignments.length)) {
    throw new Error(`Il draft deve contenere ${ordinaryPickCount} oppure ${ordinaryPickCount + 2} posizioni.`);
  }
  validateDraftOrderProgress(assignments, teamCodes, draftYear);
  const positions = assignments.map((assignment) => assignment.position);
  if (positions.some((position) => !Number.isInteger(position) || position < 1 || position > assignments.length)) {
    throw new Error(`Le posizioni devono essere comprese tra 1 e ${assignments.length}.`);
  }
  if (new Set(positions).size !== assignments.length) throw new Error(`Ogni posizione da 1 a ${assignments.length} deve comparire una sola volta.`);
  if (assignments.some((assignment) => !teamCodes.includes(assignment.originTeamCode))) {
    throw new Error("Una delle squadre selezionate non appartiene alla lega.");
  }
  if (assignments.some((assignment) => assignment.round && assignment.round !== draftRoundForPosition(assignment.position, assignments.length))) {
    throw new Error("Una scelta risulta inserita nel giro sbagliato.");
  }

  for (const round of ["1° giro", "2° giro"] as const) {
    const roundAssignments = assignments.filter((assignment) => assignmentRound(assignment, assignments.length) === round);
    const bonuses = roundAssignments.filter((assignment) => assignment.isBonus);
    const expectedBonuses = expectedBonusCount / 2;
    if (bonuses.length !== expectedBonuses) {
      throw new Error(expectedBonuses
        ? `${round}: seleziona esattamente una scelta bonus.`
        : `${round}: il Draft 2026 non prevede scelte bonus.`);
    }
    const ordinaryOrigins = roundAssignments.filter((assignment) => !assignment.isBonus).map((assignment) => assignment.originTeamCode);
    const missingTeams = teamCodes.filter((teamCode) => !ordinaryOrigins.includes(teamCode));
    const duplicateTeams = teamCodes.filter((teamCode) => ordinaryOrigins.filter((code) => code === teamCode).length > 1);
    if (missingTeams.length || duplicateTeams.length) {
      if (duplicateTeams.length) {
        throw new Error(`${round}: ${duplicateTeams.join(", ")} compare più volte tra le scelte non bonus.`);
      }
      throw new Error(`${round}: ogni squadra deve avere esattamente una scelta ordinaria.`);
    }
  }
}

export function validateDraftOrderProgress(assignments: DraftOrderAssignment[], teamCodes: string[], draftYear?: number) {
  if (assignments.length < 1 || assignments.length > 30) {
    throw new Error("Il pannello deve contenere da 1 a 30 posizioni.");
  }
  const positions = assignments.map((assignment) => assignment.position);
  if (positions.some((position) => !Number.isInteger(position) || position < 1 || position > assignments.length)) {
    throw new Error(`Le posizioni devono essere comprese tra 1 e ${assignments.length}.`);
  }
  if (new Set(positions).size !== assignments.length) throw new Error(`Ogni posizione da 1 a ${assignments.length} deve comparire una sola volta.`);
  if (assignments.some((assignment) => assignment.originTeamCode && !teamCodes.includes(assignment.originTeamCode))) {
    throw new Error("Una delle squadre selezionate non appartiene alla lega.");
  }
  const roundPositionCount = draftYear === undefined
    ? assignments.length
    : defaultDraftPositionCount(draftYear, teamCodes.length);
  for (const round of ["1° giro", "2° giro"] as const) {
    const roundAssignments = assignments.filter((assignment) => assignmentRound(assignment, roundPositionCount) === round);
    if (roundAssignments.length > roundPositionCount / 2) {
      throw new Error(`${round}: risultano troppe righe.`);
    }
    if (roundAssignments.filter((assignment) => assignment.isBonus).length > 1) {
      throw new Error(`${round}: puoi indicare una sola scelta bonus.`);
    }
    const ordinaryOrigins = roundAssignments
      .filter((assignment) => !assignment.isBonus && assignment.originTeamCode)
      .map((assignment) => assignment.originTeamCode);
    if (new Set(ordinaryOrigins).size !== ordinaryOrigins.length) {
      const duplicateTeams = [...new Set(ordinaryOrigins.filter((code, index) => ordinaryOrigins.indexOf(code) !== index))];
      throw new Error(`${round}: ${duplicateTeams.join(", ")} compare più volte tra le scelte non bonus.`);
    }
  }
}

export function validateDraftOrderDraftStructure(assignments: DraftOrderAssignment[], teamCodes: string[], draftYear: number) {
  const maximumPositions = defaultDraftPositionCount(draftYear, teamCodes.length);
  if (assignments.length < 1 || assignments.length > maximumPositions) {
    throw new Error(`Il pannello deve contenere da 1 a ${maximumPositions} posizioni.`);
  }
  const positions = assignments.map((assignment) => assignment.position);
  if (positions.some((position) => !Number.isInteger(position) || position < 1 || position > assignments.length)) {
    throw new Error(`Le posizioni devono essere comprese tra 1 e ${assignments.length}.`);
  }
  if (new Set(positions).size !== assignments.length) {
    throw new Error(`Ogni posizione da 1 a ${assignments.length} deve comparire una sola volta.`);
  }
  if (assignments.some((assignment) => assignment.originTeamCode && !teamCodes.includes(assignment.originTeamCode))) {
    throw new Error("Una delle squadre selezionate non appartiene alla lega.");
  }
  const maximumPerRound = maximumPositions / 2;
  for (const round of ["1° giro", "2° giro"] as const) {
    if (assignments.filter((assignment) => assignmentRound(assignment, maximumPositions) === round).length > maximumPerRound) {
      throw new Error(`${round}: risultano troppe righe.`);
    }
  }
}

export function draftRoundForPosition(position: number, positionCount = 30) {
  const firstRoundSize = positionCount === 28 ? 14 : 15;
  return position <= firstRoundSize ? "1° giro" : "2° giro";
}

function assignmentRound(assignment: DraftOrderAssignment, positionCount: number) {
  return assignment.round ?? draftRoundForPosition(assignment.position, positionCount);
}

function draftOriginTeamCode(asset: DraftAsset, teamCodes: string[]) {
  if (asset.originTeamCode && teamCodes.includes(asset.originTeamCode)) return asset.originTeamCode;
  if (typeof asset.originOrOverall === "string" && teamCodes.includes(asset.originOrOverall)) return asset.originOrOverall;
  return null;
}

function draftOriginKey(round: string, originTeamCode: string) {
  return `${round}:${originTeamCode}`;
}

type ClauseAgreement = {
  agreementId: string;
  kind: "protection" | "swap";
  subjectYear: number;
  subjectRound: string;
  subjectOriginTeamCode: string;
  counterpartYear: number;
  counterpartOriginTeamCode: string;
  threshold?: number;
};

function resolveDraftClauses(draftAssets: DraftAsset[], draftYear: number, teamCodes: string[]) {
  const nextAssets = draftAssets.map((asset) => ({ ...asset }));
  const agreements = collectClauseAgreements(nextAssets, draftYear, teamCodes);

  for (const agreement of agreements) {
    const subjectIndex = findOriginalPick(nextAssets, agreement.subjectYear, agreement.subjectRound, agreement.subjectOriginTeamCode, teamCodes);
    const counterpartIndex = findOriginalPick(nextAssets, agreement.counterpartYear, agreement.subjectRound, agreement.counterpartOriginTeamCode, teamCodes);
    if (subjectIndex < 0 || counterpartIndex < 0) throw new Error(`Non trovo entrambe le scelte della clausola ${agreement.agreementId}.`);
    const subject = nextAssets[subjectIndex];
    const counterpart = nextAssets[counterpartIndex];
    const existingSubjectResolution = subject.clauseResolution;
    const existingCounterpartResolution = counterpart.clauseResolution;
    nextAssets[subjectIndex] = {
      ...subject,
      teamCode: existingSubjectResolution?.agreementId === agreement.agreementId
        ? existingSubjectResolution.originalOwnerTeamCode
        : subject.teamCode,
      clauseResolution: existingSubjectResolution ?? clauseResolutionFor(agreement, "subject", subject.teamCode),
    };
    nextAssets[counterpartIndex] = {
      ...counterpart,
      teamCode: existingCounterpartResolution?.agreementId === agreement.agreementId
        ? existingCounterpartResolution.originalOwnerTeamCode
        : counterpart.teamCode,
      clauseResolution: existingCounterpartResolution ?? clauseResolutionFor(agreement, "counterpart", counterpart.teamCode),
    };
  }

  let ownershipChanges = 0;
  for (const agreement of agreements) {
    const subjectIndex = findOriginalPick(nextAssets, agreement.subjectYear, agreement.subjectRound, agreement.subjectOriginTeamCode, teamCodes);
    const counterpartIndex = findOriginalPick(nextAssets, agreement.counterpartYear, agreement.subjectRound, agreement.counterpartOriginTeamCode, teamCodes);
    const subject = nextAssets[subjectIndex];
    const counterpart = nextAssets[counterpartIndex];
    const subjectPosition = draftOverallPosition(subject.originOrOverall);
    const counterpartPosition = draftOverallPosition(counterpart.originOrOverall);
    const protectionTriggered = agreement.kind === "protection"
      && subjectPosition !== null
      && subjectPosition <= (agreement.threshold ?? 0);
    const swapTriggered = agreement.kind === "swap"
      && subjectPosition !== null
      && counterpartPosition !== null
      && counterpartPosition < subjectPosition;
    if (protectionTriggered || swapTriggered) {
      nextAssets[subjectIndex] = { ...subject, teamCode: counterpart.teamCode };
      nextAssets[counterpartIndex] = { ...counterpart, teamCode: subject.teamCode };
      ownershipChanges += 1;
    }
    nextAssets[subjectIndex] = { ...nextAssets[subjectIndex], label: "Scelta" };
    nextAssets[counterpartIndex] = { ...nextAssets[counterpartIndex], label: "Scelta" };
  }

  return { draftAssets: nextAssets, resolvedClauses: agreements.length, ownershipChanges };
}

function collectClauseAgreements(draftAssets: DraftAsset[], draftYear: number, teamCodes: string[]) {
  const agreements = new Map<string, ClauseAgreement>();
  for (const asset of draftAssets) {
    if (asset.clauseResolution?.subjectYear === draftYear && ["protected", "swap_right"].includes(asset.clauseResolution.role)) {
      const resolution = asset.clauseResolution;
      agreements.set(resolution.agreementId, {
        agreementId: resolution.agreementId,
        kind: resolution.role === "protected" ? "protection" : "swap",
        subjectYear: resolution.subjectYear,
        subjectRound: asset.round,
        subjectOriginTeamCode: resolution.subjectOriginTeamCode,
        counterpartYear: resolution.counterpartYear,
        counterpartOriginTeamCode: resolution.counterpartOriginTeamCode,
        threshold: resolution.threshold,
      });
      continue;
    }
    if (asset.year !== draftYear || asset.isBonus) continue;
    const originTeamCode = draftOriginTeamCode(asset, teamCodes);
    if (!originTeamCode) continue;
    const protection = parseProtection(asset.label);
    if (protection) {
      const agreementId = `protection:${draftYear}:${asset.round}:${originTeamCode}:${protection.counterpartYear}:${protection.counterpartOriginTeamCode}`;
      agreements.set(agreementId, {
        agreementId,
        kind: "protection",
        subjectYear: draftYear,
        subjectRound: asset.round,
        subjectOriginTeamCode: originTeamCode,
        counterpartYear: protection.counterpartYear,
        counterpartOriginTeamCode: protection.counterpartOriginTeamCode,
        threshold: protection.threshold,
      });
      continue;
    }
    const swap = asset.label.match(/^Diritto di swap con ([A-Z]+)$/i);
    if (swap) {
      const counterpartOriginTeamCode = swap[1].toUpperCase();
      const agreementId = `swap:${draftYear}:${asset.round}:${originTeamCode}:${counterpartOriginTeamCode}`;
      agreements.set(agreementId, {
        agreementId,
        kind: "swap",
        subjectYear: draftYear,
        subjectRound: asset.round,
        subjectOriginTeamCode: originTeamCode,
        counterpartYear: draftYear,
        counterpartOriginTeamCode,
      });
    }
  }
  return [...agreements.values()];
}

function parseProtection(label: string) {
  const compact = label.match(/^Protetta top (\d+),\s*1[ªa]\s+(\d{4})\s+([A-Z]+)$/i);
  const extended = label.match(/^Protetta top (\d+);\s*contropartita:\s*1[ªa]\s+scelta\s+(\d{4})\s+([A-Z]+)$/i);
  const match = compact ?? extended;
  if (!match) return null;
  return {
    threshold: Number(match[1]),
    counterpartYear: Number(match[2]),
    counterpartOriginTeamCode: match[3].toUpperCase(),
  };
}

function findOriginalPick(draftAssets: DraftAsset[], year: number, round: string, originTeamCode: string, teamCodes: string[]) {
  return draftAssets.findIndex((asset) => (
    asset.year === year
    && asset.round === round
    && !asset.isBonus
    && draftOriginTeamCode(asset, teamCodes) === originTeamCode
  ));
}

function clauseResolutionFor(agreement: ClauseAgreement, side: "subject" | "counterpart", originalOwnerTeamCode: string): DraftClauseResolution {
  return {
    agreementId: agreement.agreementId,
    role: agreement.kind === "protection"
      ? side === "subject" ? "protected" : "protection_counterparty"
      : side === "subject" ? "swap_right" : "swap_subject",
    subjectYear: agreement.subjectYear,
    subjectOriginTeamCode: agreement.subjectOriginTeamCode,
    counterpartYear: agreement.counterpartYear,
    counterpartOriginTeamCode: agreement.counterpartOriginTeamCode,
    threshold: agreement.threshold,
    originalOwnerTeamCode,
  };
}
