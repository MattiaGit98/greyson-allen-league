import type { DraftAsset, DraftClauseResolution, RosterEntry } from "./league-types";
import type { EditableLeagueState } from "./league-state";
import type { TradePickClause, TradeSlot } from "./rules/trade";
import type { SignAndTradeRequest } from "./sign-and-trade";

export type TradeTransactionPayload = {
  signAndTrade: SignAndTradeRequest | null;
  participantCodes: string[];
  playerMoves: {
    id: string;
    fromTeamCode: string;
    toTeamCode: string;
    destinationSlot: TradeSlot;
  }[];
  pickMoves: {
    id: string;
    fromTeamCode: string;
    toTeamCode: string;
  }[];
  pickClauses: {
    id: string;
    pickId: string;
    pickOwnerTeamCode: string;
    beneficiaryTeamCode: string;
    clause: TradePickClause;
    counterpartyPickId: string | null;
    counterpartyTeamCode: string | null;
  }[];
  qualifyingOfferMoves: {
    id: string;
    fromTeamCode: string;
    toTeamCode: string;
  }[];
  existingClauseChanges: {
    agreementId: string;
    action: "remove" | "modify";
    clause: Exclude<TradePickClause, "none"> | null;
  }[];
  cuts: {
    id: string;
    teamCode: string;
  }[];
  promotions?: {
    id: string;
    teamCode: string;
    destinationSlot: TradeSlot;
  }[];
};

export type ValidatedTradeChanges = {
  playerMoves: { stateIndex: number; toTeamCode: string; destinationSlot: TradeSlot }[];
  pickMoves: { stateIndex: number; toTeamCode: string }[];
  pickClauses: {
    subjectIndex: number;
    counterpartyIndex: number | null;
    clause: Exclude<TradePickClause, "none">;
  }[];
  qualifyingOfferMoves: { stateIndex: number; toTeamCode: string }[];
  existingClauseChanges: {
    subjectIndex: number;
    counterpartyIndex: number;
    clause: Exclude<TradePickClause, "none"> | null;
  }[];
  cuts: { stateIndex: number; entry?: RosterEntry }[];
  promotions?: { stateIndex: number; destinationSlot: TradeSlot }[];
};

export type ExistingTradeClauseAgreement = {
  agreementId: string;
  subjectPickId: string;
  counterpartyPickId: string;
  subjectOwnerTeamCode: string;
  counterpartyOwnerTeamCode: string;
  subjectYear: number;
  counterpartyYear: number;
  subjectRound: string;
  counterpartyRound: string;
  clause: Exclude<TradePickClause, "none">;
  label: string;
  subjectIndex: number;
  counterpartyIndex: number;
};

export function tradePlayerId(teamCode: string, playerName: string) {
  return `${teamCode}:player:${playerName}`;
}

export function tradePickId(teamCode: string, stateIndex: number, pick: Pick<DraftAsset, "year" | "round" | "originOrOverall">) {
  return `${teamCode}:pick:${stateIndex}:${pick.year}:${pick.round}:${pick.originOrOverall}`;
}

export function tradeQualifyingOfferId(teamCode: string, playerName: string) {
  return `${teamCode}:qo:${playerName}`;
}

export function existingTradeClauseAgreements(assets: DraftAsset[], teamCodes: string[]): ExistingTradeClauseAgreement[] {
  const agreements = new Map<string, ExistingTradeClauseAgreement>();
  const resolutionGroups = new Map<string, { index: number; asset: DraftAsset }[]>();
  assets.forEach((asset, index) => {
    if (!asset.clauseResolution) return;
    const rows = resolutionGroups.get(asset.clauseResolution.agreementId) ?? [];
    rows.push({ index, asset });
    resolutionGroups.set(asset.clauseResolution.agreementId, rows);
  });
  for (const [agreementId, rows] of resolutionGroups) {
    const subject = rows.find(({ asset }) => ["protected", "swap_right"].includes(asset.clauseResolution!.role));
    const counterpart = rows.find(({ asset }) => ["protection_counterparty", "swap_subject"].includes(asset.clauseResolution!.role));
    if (!subject || !counterpart) continue;
    const resolution = subject.asset.clauseResolution!;
    const clause = resolution.role === "swap_right"
      ? "swap" as const
      : `protected_top_${resolution.threshold ?? 1}` as const;
    agreements.set(agreementId, agreementFromPair(agreementId, subject, counterpart, clause));
  }

  assets.forEach((subject, subjectIndex) => {
    if (subject.clauseResolution) return;
    const subjectOrigin = draftOriginTeamCode(subject, teamCodes);
    if (!subjectOrigin) return;
    const protection = parseProtection(subject.label);
    const swap = subject.label.match(/^Diritto di swap con ([A-Z]+)$/i);
    const counterpartYear = protection?.counterpartYear ?? subject.year;
    const counterpartOrigin = protection?.counterpartOriginTeamCode ?? swap?.[1]?.toUpperCase();
    if (!counterpartOrigin) return;
    const counterpartyIndex = assets.findIndex((asset, index) => (
      index !== subjectIndex
      && asset.year === counterpartYear
      && asset.round === (protection?.counterpartRound ?? subject.round)
      && draftOriginTeamCode(asset, teamCodes) === counterpartOrigin
    ));
    if (counterpartyIndex < 0) return;
    const counterpart = assets[counterpartyIndex];
    const agreementId = protection
      ? `protection:${subject.year}:${subject.round}:${subjectOrigin}:${counterpart.year}:${counterpart.round}:${counterpartOrigin}`
      : `swap:${subject.year}:${subject.round}:${subjectOrigin}:${counterpart.year}:${counterpart.round}:${counterpartOrigin}`;
    if (agreements.has(agreementId)) return;
    const clause = protection ? `protected_top_${protection.threshold}` as const : "swap" as const;
    agreements.set(agreementId, agreementFromPair(
      agreementId,
      { index: subjectIndex, asset: subject },
      { index: counterpartyIndex, asset: counterpart },
      clause,
    ));
  });
  return [...agreements.values()];
}

export function applyValidatedTrade(
  state: EditableLeagueState,
  changes: ValidatedTradeChanges,
): EditableLeagueState {
  const playerMoveByIndex = new Map(changes.playerMoves.map((move) => [move.stateIndex, move]));
  const cutIndexes = new Set(changes.cuts.map((cut) => cut.stateIndex));
  const promotionByIndex = new Map((changes.promotions ?? []).map((promotion) => [promotion.stateIndex, promotion]));
  const rosterEntries: RosterEntry[] = state.rosterEntries.map((entry, index) => {
    const move = playerMoveByIndex.get(index);
    if (move) {
      // Il contratto e tutti i suoi metadati restano invariati: cambiano soltanto
      // proprietario e, nei limiti consentiti, slot di destinazione.
      return { ...entry, teamCode: move.toTeamCode, slot: move.destinationSlot };
    }
    if (cutIndexes.has(index)) {
      const replacement = changes.cuts.find((cut) => cut.stateIndex === index)?.entry;
      return replacement ?? { ...entry, state: "cut", slot: "regular" };
    }
    const promotion = promotionByIndex.get(index);
    if (promotion) return { ...entry, slot: promotion.destinationSlot };
    return entry;
  });

  const pickMoveByIndex = new Map(changes.pickMoves.map((move) => [move.stateIndex, move]));
  let draftAssets = state.draftAssets.map((asset, index) => {
    const move = pickMoveByIndex.get(index);
    return move ? {
      ...asset,
      teamCode: move.toTeamCode,
      clauseResolution: asset.clauseResolution
        ? { ...asset.clauseResolution, originalOwnerTeamCode: move.toTeamCode }
        : undefined,
    } : { ...asset };
  });
  for (const change of changes.existingClauseChanges) {
    draftAssets = clearDraftClause(draftAssets, change.subjectIndex, change.counterpartyIndex);
    if (change.clause) {
      draftAssets = applyDraftClauses(draftAssets, [{
        subjectIndex: change.subjectIndex,
        counterpartyIndex: change.counterpartyIndex,
        clause: change.clause,
      }], state.teams.map((team) => team.code));
    }
  }
  for (const agreement of existingTradeClauseAgreements(draftAssets, state.teams.map((team) => team.code))) {
    if (agreement.subjectOwnerTeamCode === agreement.counterpartyOwnerTeamCode) {
      draftAssets = clearDraftClause(draftAssets, agreement.subjectIndex, agreement.counterpartyIndex);
    }
  }
  draftAssets = applyDraftClauses(draftAssets, changes.pickClauses, state.teams.map((team) => team.code));

  const qualifyingMoveByIndex = new Map(changes.qualifyingOfferMoves.map((move) => [move.stateIndex, move]));
  const qualifyingOfferRights = state.qualifyingOfferRights.map((right, index) => {
    const move = qualifyingMoveByIndex.get(index);
    return move ? { ...right, teamCode: move.toTeamCode } : right;
  });

  return { ...state, rosterEntries, draftAssets, qualifyingOfferRights };
}

function agreementFromPair(
  agreementId: string,
  subject: { index: number; asset: DraftAsset },
  counterpart: { index: number; asset: DraftAsset },
  clause: Exclude<TradePickClause, "none">,
): ExistingTradeClauseAgreement {
  const label = clause === "swap"
    ? `${subject.asset.year} ${subject.asset.round}: diritto di swap tra ${subject.asset.originTeamCode ?? subject.asset.originOrOverall} e ${counterpart.asset.originTeamCode ?? counterpart.asset.originOrOverall}`
    : `${subject.asset.year} ${subject.asset.round}: ${clause.replace("protected_top_", "protetta top ")} · contropartita ${counterpart.asset.year} ${counterpart.asset.round}`;
  return {
    agreementId,
    subjectPickId: tradePickId(subject.asset.teamCode, subject.index, subject.asset),
    counterpartyPickId: tradePickId(counterpart.asset.teamCode, counterpart.index, counterpart.asset),
    subjectOwnerTeamCode: subject.asset.teamCode,
    counterpartyOwnerTeamCode: counterpart.asset.teamCode,
    subjectYear: subject.asset.year,
    counterpartyYear: counterpart.asset.year,
    subjectRound: subject.asset.round,
    counterpartyRound: counterpart.asset.round,
    clause,
    label,
    subjectIndex: subject.index,
    counterpartyIndex: counterpart.index,
  };
}

function clearDraftClause(assets: DraftAsset[], subjectIndex: number, counterpartyIndex: number) {
  return assets.map((asset, index) => {
    if (index !== subjectIndex && index !== counterpartyIndex) return asset;
    const { clauseResolution: _clauseResolution, ...rest } = asset;
    return { ...rest, label: "Scelta" };
  });
}

function applyDraftClauses(
  assets: DraftAsset[],
  clauses: ValidatedTradeChanges["pickClauses"],
  teamCodes: string[],
) {
  const next = assets.map((asset) => ({ ...asset }));
  for (const clause of clauses) {
    const subject = next[clause.subjectIndex];
    if (!subject) throw new Error("La scelta indicata per la clausola non esiste più.");
    const subjectOrigin = draftOriginTeamCode(subject, teamCodes);
    if (!subjectOrigin) throw new Error("Non è possibile determinare la squadra originaria della scelta vincolata.");
    const threshold = protectedThreshold(clause.clause);
    const counterpart = clause.counterpartyIndex === null ? null : next[clause.counterpartyIndex];

    if (!counterpart) {
      if (clause.clause === "swap") throw new Error("Il diritto di swap richiede una scelta di contropartita.");
      next[clause.subjectIndex] = { ...subject, label: `Protetta top ${threshold}` };
      continue;
    }

    const counterpartOrigin = draftOriginTeamCode(counterpart, teamCodes);
    if (!counterpartOrigin) throw new Error("Non è possibile determinare la squadra originaria della contropartita.");
    const kind = clause.clause === "swap" ? "swap" : "protection";
    const agreementId = `${kind}:${subject.year}:${subject.round}:${subjectOrigin}:${counterpart.year}:${counterpart.round}:${counterpartOrigin}`;
    const common = {
      agreementId,
      subjectYear: subject.year,
      subjectRound: subject.round,
      subjectOriginTeamCode: subjectOrigin,
      counterpartYear: counterpart.year,
      counterpartRound: counterpart.round,
      counterpartOriginTeamCode: counterpartOrigin,
      ...(threshold === null ? {} : { threshold }),
    };
    const subjectResolution: DraftClauseResolution = {
      ...common,
      role: kind === "swap" ? "swap_right" : "protected",
      originalOwnerTeamCode: subject.teamCode,
    };
    const counterpartResolution: DraftClauseResolution = {
      ...common,
      role: kind === "swap" ? "swap_subject" : "protection_counterparty",
      originalOwnerTeamCode: counterpart.teamCode,
    };
    const subjectRoundOrdinal = subject.round.startsWith("2") ? "2ª" : "1ª";
    const counterpartRoundOrdinal = counterpart.round.startsWith("2") ? "2ª" : "1ª";
    next[clause.subjectIndex] = {
      ...subject,
      label: kind === "swap"
        ? `Diritto di swap con ${counterpartOrigin}`
        : `Protetta top ${threshold}; contropartita: ${counterpartRoundOrdinal} scelta ${counterpart.year} ${counterpartOrigin}`,
      clauseResolution: subjectResolution,
    };
    next[clause.counterpartyIndex!] = {
      ...counterpart,
      label: kind === "swap"
        ? `Subisce il diritto di swap con ${subjectOrigin}`
        : `Contropartita se la ${subjectRoundOrdinal} scelta ${subject.year} ${subjectOrigin} rientra in top ${threshold}`,
      clauseResolution: counterpartResolution,
    };
  }
  return next;
}

function protectedThreshold(clause: Exclude<TradePickClause, "none">) {
  if (clause === "swap") return null;
  const value = Number(clause.replace("protected_top_", ""));
  if (!Number.isInteger(value) || value < 1 || value > 13) throw new Error("Protezione della scelta non valida.");
  return value;
}

function draftOriginTeamCode(asset: DraftAsset, teamCodes: string[]) {
  if (asset.originTeamCode && teamCodes.includes(asset.originTeamCode)) return asset.originTeamCode;
  if (typeof asset.originOrOverall === "string" && teamCodes.includes(asset.originOrOverall)) return asset.originOrOverall;
  return null;
}

function parseProtection(label: string) {
  const compact = label.match(/^Protetta top (\d+),\s*([12])[ªa]\s+(\d{4})\s+([A-Z]+)$/i);
  const extended = label.match(/^Protetta top (\d+);\s*contropartita:\s*([12])[ªa]\s+scelta\s+(\d{4})\s+([A-Z]+)$/i);
  const match = compact ?? extended;
  if (!match) return null;
  return {
    threshold: Number(match[1]),
    counterpartRound: `${match[2]}° giro`,
    counterpartYear: Number(match[3]),
    counterpartOriginTeamCode: match[4].toUpperCase(),
  };
}
