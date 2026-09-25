"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizePlayerName } from "@/lib/admin-alerts";
import { capOverrideSummary, requireCapCompliance, salaryCapWarningsForSpaces } from "@/lib/cap-override";
import { nextDraftYear } from "@/lib/draft-positions";
import { fourthDraftVirtualPicks, materializeFourthDraftPicks } from "@/lib/future-draft-picks";
import { synchronizeUnassignedDraftOwners } from "@/lib/draft-history";
import { loadHistoryCompetitionState } from "@/lib/history-competition-store";
import { loadEditableLeagueState } from "@/lib/league-state";
import { hasReachedMoment, leagueMomentFromSeason, operationWindows, tradeDeadlineHasPassed, tradesAreSuspendedForAuction } from "@/lib/league-moments";
import { persistLeagueMovement } from "@/lib/league-movements";
import { tradedPostAuctionContractDraftNames } from "@/lib/post-auction-contracts";
import { removeRolelessPlayersLeavingRosters } from "@/lib/roleless-player-list";
import { countRosterRoles } from "@/lib/rules/roster";
import { roleMinimumChecksApply, roleMinimumRecoverySlotError } from "@/lib/role-minimums";
import {
  evaluateTrade,
  type TradeCut,
  type TradePickClauseAgreement,
  type TradePickMove,
  type TradePlayerMove,
  type TradePromotion,
  type TradeQualifyingOfferMove,
  type TradeSlot,
} from "@/lib/rules/trade";
import { calculateCapSpace, followingSeasonName, seasonEndYear, shouldCountTeamOptions } from "@/lib/season-time";
import { legalPromotionDestinations, legalSlotDestinations, type ManagedRosterSlot } from "@/lib/slot-eligibility";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildSignAndTradeProvisional, signAndTradeTransfersNewSigning, type SignAndTradeRequest } from "@/lib/sign-and-trade";
import { applyStandardContractCut, isUnresolvedTeamOption } from "@/lib/team-option-contract";
import {
  applyValidatedTrade,
  existingTradeClauseAgreements,
  tradePickId,
  tradePlayerId,
  tradeQualifyingOfferId,
  type TradeTransactionPayload,
  type ValidatedTradeChanges,
} from "@/lib/trade-state";

const path = "/admin/scambi";

export async function registerTrade(formData: FormData) {
  const roleMinimumConfirmed = formData.get("role_minimum_confirmed") === "true";
  const recordAsCorrection = formData.get("record_as_correction") === "true";
  let payload: TradeTransactionPayload;
  try {
    payload = parsePayload(formData.get("trade_json"));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Scambio non valido.");
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) fail("Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) fail("Sessione scaduta.");
  const seasonResponse = await supabase
    .from("seasons")
    .select("name,status,team_options_resolved,trade_deadline_passed,timeline_moment")
    .eq("is_active", true)
    .maybeSingle();
  if (seasonResponse.error || !seasonResponse.data) fail(seasonResponse.error?.message ?? "Nessuna stagione attiva.");
  const season = seasonResponse.data;
  const moment = leagueMomentFromSeason(season);
  if (!operationWindows.trades(moment)) {
    fail(tradesAreSuspendedForAuction(moment)
      ? "Gli scambi sono sospesi da Inizio asta fino a Termine asta."
      : "Gli scambi non sono disponibili dopo la trade deadline.");
  }

  const [originalState, history] = await Promise.all([
    loadEditableLeagueState(),
    loadHistoryCompetitionState(),
  ]);
  let provisionalSignAndTrade: ReturnType<typeof buildSignAndTradeProvisional> | null = null;
  if (payload.signAndTrade) {
    try {
      provisionalSignAndTrade = buildSignAndTradeProvisional({
        state: originalState,
        request: payload.signAndTrade,
        seasonName: season.name,
        phase: season.status,
        moment,
      });
    } catch (error) {
      fail(error instanceof Error ? error.message : "Sign and trade non valido.");
    }
  }
  const state = provisionalSignAndTrade?.state ?? originalState;
  const requestedFuturePickIds = payload.pickClauses.flatMap((clause) => [
    clause.pickId,
    ...(clause.counterpartyPickId ? [clause.counterpartyPickId] : []),
  ]);
  const requestedVirtualFourthPicks = fourthDraftVirtualPicks(state.draftAssets, state.teams)
    .filter((pick) => requestedFuturePickIds.includes(pick.id));
  const tradeState = {
    ...state,
    draftAssets: materializeFourthDraftPicks(
      state.draftAssets,
      state.teams,
      requestedFuturePickIds,
    ),
  };
  const validTeamCodes = new Set(originalState.teams.map((team) => team.code));
  const participantCodes = payload.participantCodes.map((code) => code.toUpperCase());
  if (participantCodes.length < 2 || new Set(participantCodes).size !== participantCodes.length) {
    fail("Lo scambio deve coinvolgere almeno due squadre diverse.");
  }
  if (participantCodes.some((code) => !validTeamCodes.has(code))) fail("Una delle squadre coinvolte non è valida.");
  if (provisionalSignAndTrade && !participantCodes.includes(provisionalSignAndTrade.signerTeamCode)) {
    fail("La squadra firmataria deve partecipare allo scambio.");
  }
  if (provisionalSignAndTrade && !signAndTradeTransfersNewSigning(
    payload.playerMoves,
    provisionalSignAndTrade.signingEntryId,
    provisionalSignAndTrade.signerTeamCode,
  )) {
    fail("Il sign and trade deve trasferire il giocatore appena firmato a un'altra squadra.");
  }
  const participants = new Set(participantCodes);
  const qualifyingOfferTransfersOpen = !hasReachedMoment(moment, "auction_completed");

  const endDraft = nextDraftYear(state.draftAssets);
  const tradableDraftYears = endDraft === null ? [] : [endDraft, endDraft + 1, endDraft + 2];
  const protectionCounterpartyDraftYears = endDraft === null ? [] : [...tradableDraftYears, endDraft + 3];
  const countTeamOptions = shouldCountTeamOptions(
    season.status as "offseason" | "auction" | "regular_season",
    season.team_options_resolved ?? false,
  );
  const capSeasons = [season.name, followingSeasonName(season.name), followingSeasonName(season.name, 2)];
  const rolesByName = new Map(state.playerList.map((player) => [
    normalizePlayerName(player.name),
    player.role === "X" ? null : player.role,
  ]));
  const playerDetailsByName = new Map(state.playerList.map((player) => [normalizePlayerName(player.name), player]));
  const activePlayers = new Map(state.rosterEntries.flatMap((entry, stateIndex) => (
    entry.state === "active"
      ? [[tradePlayerId(entry.teamCode, entry.name), { entry, stateIndex }] as const]
      : []
  )));
  const picks = new Map(tradeState.draftAssets.map((pick, stateIndex) => (
    [tradePickId(pick.teamCode, stateIndex, pick), { pick, stateIndex }] as const
  )));
  for (const virtualPick of requestedVirtualFourthPicks) {
    const stateIndex = tradeState.draftAssets.findIndex((asset) => (
      asset.year === virtualPick.year
      && asset.round === virtualPick.round
      && asset.originTeamCode === virtualPick.originTeamCode
      && !asset.isBonus
    ));
    if (stateIndex >= 0) picks.set(virtualPick.id, { pick: tradeState.draftAssets[stateIndex]!, stateIndex });
  }
  const qualifyingOffers = new Map(state.qualifyingOfferRights.map((right, stateIndex) => (
    [tradeQualifyingOfferId(right.teamCode, right.playerName), { right, stateIndex }] as const
  )));
  const existingAgreements = new Map(existingTradeClauseAgreements(
    tradeState.draftAssets,
    state.teams.map((team) => team.code),
  ).map((agreement) => [agreement.agreementId, agreement]));
  const requestedRemovedAgreementIds = new Set(payload.existingClauseChanges
    .filter((change) => change.action === "remove" && change.clause === null)
    .map((change) => change.agreementId));
  const releasedClausePickIndexes = new Set([...existingAgreements.values()]
    .filter((agreement) => requestedRemovedAgreementIds.has(agreement.agreementId))
    .flatMap((agreement) => [agreement.subjectIndex, agreement.counterpartyIndex]));
  const conditionIsRemovedInThisTrade = (stateIndex: number) => releasedClausePickIndexes.has(stateIndex);

  const playerChanges: ValidatedTradeChanges["playerMoves"] = [];
  const playerMoves: TradePlayerMove[] = payload.playerMoves.map((requested) => {
    const source = activePlayers.get(requested.id);
    if (!source) fail("Un giocatore dello scambio non è più attivo nella squadra indicata; i giocatori tagliati non sono scambiabili.");
    if (source.entry.teamCode !== requested.fromTeamCode || !participants.has(requested.fromTeamCode) || !participants.has(requested.toTeamCode)) {
      fail(`${source.entry.name}: proprietario o destinazione non validi.`);
    }
    const allowedDestinationSlots: TradeSlot[] = source.entry.slot === "dpe"
      ? ["dpe" as const]
      : legalSlotDestinations(
        {
          ...source.entry,
          slot: source.entry.slot as ManagedRosterSlot,
          rookie: playerDetailsByName.get(normalizePlayerName(source.entry.name))?.rookie ?? false,
          under23: playerDetailsByName.get(normalizePlayerName(source.entry.name))?.under23 ?? false,
        },
        season.name,
        moment,
      );
    if (!allowedDestinationSlots.includes(requested.destinationSlot)) {
      fail(`${source.entry.name}: lo slot di destinazione scelto non è consentito.`);
    }
    playerChanges.push({
      stateIndex: source.stateIndex,
      toTeamCode: requested.toTeamCode,
      destinationSlot: requested.destinationSlot,
    });
    return {
      id: requested.id,
      fromTeamCode: source.entry.teamCode,
      toTeamCode: requested.toTeamCode,
      cost: source.entry.cost,
      capCost: scheduledCost(source.entry, season.name),
      futureCapCosts: Object.fromEntries(capSeasons.slice(1).map((targetSeason) => [
        targetSeason,
        scheduledCost(source.entry, targetSeason),
      ])),
      role: rolesByName.get(normalizePlayerName(source.entry.name)) ?? null,
      sourceSlot: source.entry.slot,
      destinationSlot: requested.destinationSlot,
      allowedDestinationSlots,
      sourceState: "active",
    };
  });

  const pickChanges: ValidatedTradeChanges["pickMoves"] = [];
  const pickMoves: TradePickMove[] = payload.pickMoves.map((requested) => {
    const source = picks.get(requested.id);
    if (!source || source.pick.teamCode !== requested.fromTeamCode) fail("Una scelta non appartiene più alla squadra indicata.");
    if (!participants.has(requested.fromTeamCode) || !participants.has(requested.toTeamCode)) fail("Trasferimento della scelta non valido.");
    pickChanges.push({ stateIndex: source.stateIndex, toTeamCode: requested.toTeamCode });
    return {
      id: requested.id,
      fromTeamCode: source.pick.teamCode,
      toTeamCode: requested.toTeamCode,
      year: source.pick.year,
      round: source.pick.round,
      hasExistingCondition: hasDraftCondition(source.pick) && !conditionIsRemovedInThisTrade(source.stateIndex),
      clause: "none",
      counterpartyPickId: null,
      counterpartyYear: null,
      counterpartyRound: null,
      counterpartyHasExistingCondition: false,
    };
  });

  const pickMoveById = new Map(pickMoves.map((move) => [move.id, move]));
  const postTradePickOwner = (pickId: string, currentOwnerTeamCode: string) => (
    pickMoveById.get(pickId)?.toTeamCode ?? currentOwnerTeamCode
  );
  for (const agreement of existingAgreements.values()) {
    if (
      postTradePickOwner(agreement.subjectPickId, agreement.subjectOwnerTeamCode)
      === postTradePickOwner(agreement.counterpartyPickId, agreement.counterpartyOwnerTeamCode)
    ) {
      requestedRemovedAgreementIds.add(agreement.agreementId);
      releasedClausePickIndexes.add(agreement.subjectIndex);
      releasedClausePickIndexes.add(agreement.counterpartyIndex);
    }
  }

  const pickClauseChanges: ValidatedTradeChanges["pickClauses"] = [];
  const pickClauses: TradePickClauseAgreement[] = payload.pickClauses.map((requested) => {
    const subject = picks.get(requested.pickId);
    const counterpart = requested.counterpartyPickId ? picks.get(requested.counterpartyPickId) : undefined;
    if (!subject || subject.pick.teamCode !== requested.pickOwnerTeamCode) fail("La scelta indicata per la clausola non è più disponibile.");
    if (!participants.has(subject.pick.teamCode) || !participants.has(requested.beneficiaryTeamCode)) fail("Clausola della scelta non valida.");
    if (requested.clause === "none") fail("Seleziona il tipo di clausola.");
    if (!counterpart) fail("Seleziona la scelta di contropartita della clausola.");
    if (requested.counterpartyTeamCode !== counterpart.pick.teamCode) fail("Proprietario della contropartita non valido.");
    if (!participants.has(counterpart.pick.teamCode)) fail("La contropartita deve appartenere a una squadra coinvolta nello scambio.");
    const subjectMove = pickMoveById.get(requested.pickId);
    const subjectPostTradeOwner = postTradePickOwner(requested.pickId, subject.pick.teamCode);
    const counterpartyPostTradeOwner = postTradePickOwner(requested.counterpartyPickId!, counterpart.pick.teamCode);
    if (requested.clause.startsWith("protected_top_")) {
      if (!subjectMove) fail("Una protezione può essere inserita soltanto su una scelta ceduta nello stesso scambio.");
      if (counterpartyPostTradeOwner !== subjectMove.fromTeamCode) fail("La contropartita della protezione deve appartenere, dopo lo scambio, alla squadra che cede la scelta protetta.");
      if (!isLaterDraftPick(counterpart.pick.year, counterpart.pick.round, subject.pick.year, subject.pick.round)) {
        fail("La contropartita della protezione deve manifestarsi dopo la scelta protetta.");
      }
    } else {
      if (subjectPostTradeOwner === counterpartyPostTradeOwner) fail("Le due scelte di uno swap devono appartenere a proprietari diversi dopo lo scambio.");
      if (subject.pick.year !== counterpart.pick.year || subject.pick.round !== counterpart.pick.round) {
        fail("Le due scelte di uno swap devono appartenere allo stesso draft e giro.");
      }
    }
    pickClauseChanges.push({
      subjectIndex: subject.stateIndex,
      counterpartyIndex: counterpart?.stateIndex ?? null,
      clause: requested.clause,
    });
    return {
      id: requested.id,
      pickId: requested.pickId,
      pickOwnerTeamCode: subject.pick.teamCode,
      beneficiaryTeamCode: requested.beneficiaryTeamCode,
      year: subject.pick.year,
      round: subject.pick.round,
      hasExistingCondition: hasDraftCondition(subject.pick) && !conditionIsRemovedInThisTrade(subject.stateIndex),
      clause: requested.clause,
      counterpartyPickId: counterpart ? requested.counterpartyPickId : null,
      counterpartyYear: counterpart?.pick.year ?? null,
      counterpartyRound: counterpart?.pick.round ?? null,
      counterpartyHasExistingCondition: counterpart ? hasDraftCondition(counterpart.pick) && !conditionIsRemovedInThisTrade(counterpart.stateIndex) : false,
      counterpartyOwnerTeamCode: counterpart?.pick.teamCode ?? null,
      postTradeOwnerTeamCode: subjectPostTradeOwner,
      counterpartyPostTradeOwnerTeamCode: counterpartyPostTradeOwner,
      subjectWasTraded: Boolean(subjectMove),
      subjectTradeFromTeamCode: subjectMove?.fromTeamCode ?? null,
    };
  });

  const existingClauseChanges: ValidatedTradeChanges["existingClauseChanges"] = [];
  const evaluatedExistingClauseChanges = [...requestedRemovedAgreementIds].map((agreementId) => {
    const agreement = existingAgreements.get(agreementId);
    if (!agreement) fail("La clausola da rimuovere non esiste più.");
    if (!participants.has(agreement.subjectOwnerTeamCode) || !participants.has(agreement.counterpartyOwnerTeamCode)) {
      fail("Per rimuovere una clausola devono partecipare entrambe le squadre interessate.");
    }
    existingClauseChanges.push({
      subjectIndex: agreement.subjectIndex,
      counterpartyIndex: agreement.counterpartyIndex,
      clause: null,
    });
    return {
      agreementId: agreement.agreementId,
      subjectOwnerTeamCode: agreement.subjectOwnerTeamCode,
      counterpartyOwnerTeamCode: agreement.counterpartyOwnerTeamCode,
      subjectYear: agreement.subjectYear,
      counterpartyYear: agreement.counterpartyYear,
      subjectRound: agreement.subjectRound,
      counterpartyRound: agreement.counterpartyRound,
      action: "remove" as const,
      clause: null,
    };
  });

  const qualifyingChanges: ValidatedTradeChanges["qualifyingOfferMoves"] = [];
  const qualifyingOfferMoves: TradeQualifyingOfferMove[] = payload.qualifyingOfferMoves.map((requested) => {
    if (!qualifyingOfferTransfersOpen) fail("Le qualifying offer si possono scambiare soltanto dall'inizio dell'offseason fino al termine dell'asta.");
    const source = qualifyingOffers.get(requested.id);
    if (!source || source.right.teamCode !== requested.fromTeamCode) fail("Una qualifying offer non appartiene più alla squadra indicata.");
    if (!participants.has(requested.fromTeamCode) || !participants.has(requested.toTeamCode)) fail("Trasferimento della qualifying offer non valido.");
    qualifyingChanges.push({ stateIndex: source.stateIndex, toTeamCode: requested.toTeamCode });
    return { id: requested.id, fromTeamCode: source.right.teamCode, toTeamCode: requested.toTeamCode };
  });

  const cutChanges: ValidatedTradeChanges["cuts"] = [];
  const currentEndYear = seasonEndYear(season.name);
  if (currentEndYear === null) fail("Annata non valida.");
  const cuts: TradeCut[] = payload.cuts.map((requested) => {
    const source = activePlayers.get(requested.id);
    if (!source || source.entry.teamCode !== requested.teamCode || !participants.has(requested.teamCode)) {
      fail("Un giocatore indicato per il taglio contestuale non è più disponibile.");
    }
    if (isUnresolvedTeamOption(source.entry, moment)) {
      fail(`${source.entry.name}: una team option non ancora esercitata può essere risolta soltanto nel pannello Team option.`);
    }
    cutChanges.push({
      stateIndex: source.stateIndex,
      entry: applyStandardContractCut(source.entry, currentEndYear, moment),
    });
    return {
      id: requested.id,
      teamCode: requested.teamCode,
      cost: scheduledCost(source.entry, season.name),
      role: rolesByName.get(normalizePlayerName(source.entry.name)) ?? null,
      slot: source.entry.slot,
    };
  });

  const promotionChanges: ValidatedTradeChanges["promotions"] = [];
  const promotions: TradePromotion[] = (payload.promotions ?? []).map((requested) => {
    const source = activePlayers.get(requested.id);
    if (!source || source.entry.teamCode !== requested.teamCode || !participants.has(requested.teamCode)) {
      fail("Un giocatore indicato per la promozione contestuale non è più disponibile.");
    }
    if (source.entry.slot === "dpe") {
      fail(`${source.entry.name}: questo giocatore non può essere promosso in questa fase.`);
    }
    const destinations = legalPromotionDestinations(
      { ...source.entry, slot: source.entry.slot as ManagedRosterSlot },
      season.name,
      moment,
    );
    if (!destinations.includes(requested.destinationSlot as ManagedRosterSlot)) {
      fail(`${source.entry.name}: la destinazione della promozione non è consentita.`);
    }
    const destinationSlot = requested.destinationSlot as Exclude<TradeSlot, "dpe">;
    promotionChanges.push({ stateIndex: source.stateIndex, destinationSlot });
    return {
      id: requested.id,
      teamCode: requested.teamCode,
      sourceSlot: source.entry.slot as Exclude<TradeSlot, "dpe">,
      destinationSlot,
    };
  });

  const tradeTeams = participantCodes.map((teamCode) => {
    const teamEntries = state.rosterEntries.filter((entry) => entry.teamCode === teamCode);
    const activeEntries = teamEntries.filter((entry) => entry.state === "active");
    return {
      code: teamCode,
      currentCost: 1000 - calculateCapSpace({
        entries: teamEntries.filter((entry) => entry.state !== "active" || entry.slot !== "dpe"),
        seasonName: season.name,
        optionSeasonName: season.name,
        countTeamOptions,
      }),
      futureCosts: capSeasons.slice(1).map((targetSeason) => ({
        seasonName: targetSeason,
        currentCost: 1000 - calculateCapSpace({
          entries: teamEntries,
          seasonName: targetSeason,
          optionSeasonName: season.name,
          countTeamOptions,
        }),
      })),
      slots: {
        regular: activeEntries.filter((entry) => entry.slot === "regular").length,
        twoWay: activeEntries.filter((entry) => entry.slot === "two_way").length,
        gLeague: activeEntries.filter((entry) => entry.slot === "g_league").length,
        dpe: activeEntries.filter((entry) => entry.slot === "dpe").length,
      },
      roles: countRosterRoles(activeEntries.map((entry) => ({
        role: rolesByName.get(normalizePlayerName(entry.name)) ?? null,
        slot: entry.slot,
      }))),
    };
  });
  const evaluation = evaluateTrade({
    phase: season.status,
    tradeDeadlinePassed: tradeDeadlineHasPassed(moment),
    tradesOpen: operationWindows.trades(moment),
    enforceOffseasonCap: !hasReachedMoment(moment, "auction_start"),
    enforceRoleMinimums: roleMinimumChecksApply(season.status, moment),
    tradableDraftYears,
    protectionCounterpartyDraftYears,
    teams: tradeTeams,
    playerMoves,
    pickMoves,
    pickClauses,
    existingClauseChanges: evaluatedExistingClauseChanges,
    qualifyingOfferMoves,
    qualifyingOfferTransfersOpen,
    cuts,
    promotions,
  });
  if (!evaluation.valid) fail(evaluation.errors.map((issue) => issue.message).join(" "));
  const roleMinimumRestorations = evaluation.calculated.teamResults.filter((team) => team.requiredRoleFreeAgents > 0);
  const roleMinimumSlotErrors = roleMinimumRestorations.flatMap((team) => {
    const error = roleMinimumRecoverySlotError({ ...team.missingRoles, total: team.requiredRoleFreeAgents }, team.slots);
    return error ? [`${team.code}: ${error}`] : [];
  });
  if (roleMinimumSlotErrors.length) fail(roleMinimumSlotErrors.join(" "));
  if (roleMinimumRestorations.length && !roleMinimumConfirmed) {
    fail("Conferma l'assegnazione successiva dei free agent casuali da 1 credito previsti dal regolamento.");
  }
  const nextState = removeRolelessPlayersLeavingRosters(originalState, applyValidatedTrade(tradeState, {
    playerMoves: playerChanges,
    pickMoves: pickChanges,
    pickClauses: pickClauseChanges,
    existingClauseChanges,
    qualifyingOfferMoves: qualifyingChanges,
    cuts: cutChanges,
    promotions: promotionChanges,
  }));
  const actualCapWarningsByTeam = new Map(participantCodes.map((teamCode) => {
    const before = teamCapSpaces(state.rosterEntries, teamCode);
    const after = teamCapSpaces(nextState.rosterEntries, teamCode);
    return [teamCode, salaryCapWarningsForSpaces({
      before,
      after,
      seasonNames: capSeasons,
      phase: season.status,
      currentMoment: moment,
    })] as const;
  }));
  const dpeCutTeams = new Set(cuts.filter((cut) => cut.slot === "dpe").map((cut) => cut.teamCode));
  const blockingDpeCut = [...dpeCutTeams].flatMap((teamCode) => actualCapWarningsByTeam.get(teamCode) ?? [])[0];
  if (blockingDpeCut) fail(`Il taglio di un giocatore dalla DPE non può violare il salary cap. ${blockingDpeCut}`);
  const capWarnings = [...new Set([
    ...evaluation.warnings
      .filter((warning) => warning.code.includes("CAP"))
      .map((warning) => warning.message),
    ...[...actualCapWarningsByTeam.entries()].flatMap(([teamCode, warnings]) => warnings.map((warning) => `${teamCode}: ${warning}`)),
  ])];
  requireCapCompliance(capWarnings, fail);
  const operationType = recordAsCorrection
    ? "rettifica_admin_scambio"
    : provisionalSignAndTrade
      ? "sign_and_trade"
      : "scambio";
  const movementDetails = [
    ...(provisionalSignAndTrade ? [provisionalSignAndTrade.label] : []),
    ...playerChanges.flatMap((change) => {
      const entry = state.rosterEntries[change.stateIndex];
      return entry ? [`${entry.name}: ${entry.teamCode} → ${change.toTeamCode}; ${tradeSlotLabel(entry.slot)} → ${tradeSlotLabel(change.destinationSlot)}; ${entry.cost} crediti, contratto ${entry.contract}`] : [];
    }),
    ...pickChanges.flatMap((change) => {
      const pick = tradeState.draftAssets[change.stateIndex];
      return pick ? [`Scelta ${tradePickLabel(pick)}: ${pick.teamCode} → ${change.toTeamCode}`] : [];
    }),
    ...pickClauseChanges.flatMap((change) => {
      const subject = tradeState.draftAssets[change.subjectIndex];
      const counterparty = change.counterpartyIndex === null ? null : tradeState.draftAssets[change.counterpartyIndex];
      return subject ? [`Clausola su scelta ${tradePickLabel(subject)}: ${tradeClauseLabel(change.clause)}${counterparty ? `; contropartita ${tradePickLabel(counterparty)}` : ""}`] : [];
    }),
    ...evaluatedExistingClauseChanges.map((change) => (
      change.action === "remove"
        ? `Clausola eliminata: scelta ${change.subjectYear} ${change.subjectRound} (${change.subjectOwnerTeamCode}) con contropartita ${change.counterpartyYear} ${change.counterpartyRound} (${change.counterpartyOwnerTeamCode})`
        : `Clausola modificata: scelta ${change.subjectYear} ${change.subjectRound} (${change.subjectOwnerTeamCode}); ${tradeClauseLabel(change.clause)}`
    )),
    ...qualifyingChanges.flatMap((change) => {
      const right = state.qualifyingOfferRights[change.stateIndex];
      return right ? [`Diritti Q.O. su ${right.playerName}: ${right.teamCode} → ${change.toTeamCode}; importo ${right.qualifyingAmount}`] : [];
    }),
    ...cutChanges.flatMap((change) => {
      const entry = state.rosterEntries[change.stateIndex];
      return entry ? [`Taglio contestuale: ${entry.name} (${entry.teamCode}); ${entry.cost} crediti, contratto ${entry.contract}`] : [];
    }),
    ...promotionChanges.flatMap((change) => {
      const entry = state.rosterEntries[change.stateIndex];
      return entry ? [`Promozione contestuale: ${entry.name} (${entry.teamCode}); ${tradeSlotLabel(entry.slot)} → ${tradeSlotLabel(change.destinationSlot)}`] : [];
    }),
    ...roleMinimumRestorations.map((team) => `Ripristino ruoli richiesto: ${team.code}; free agent casuali da 1 credito ${team.requiredRoleFreeAgents}`),
  ];
  const heading = provisionalSignAndTrade
    ? `Sign and trade ${participantCodes.join(" ↔ ")}`
    : `Scambio ${participantCodes.join(" ↔ ")}`;
  const summary = `${heading}: ${movementDetails.join("; ")}`;
  const movementSummary = capOverrideSummary(summary, capWarnings, false);
  const synchronizedHistory = synchronizeUnassignedDraftOwners(
    history.competitions.Draft,
    nextState.draftAssets,
    nextState.finalizedDraftPositionYears ?? [],
  );
  const resetContractDraftPlayers = operationWindows.contractAssignment(moment)
    ? tradedPostAuctionContractDraftNames(
      state,
      playerChanges.map((change) => change.stateIndex),
      season.name,
    )
    : [];
  const response = resetContractDraftPlayers.length
    ? await supabase.rpc("apply_trade_movement", {
      expected_before_state: originalState,
      next_state: nextState,
      requested_season_name: season.name,
      reset_contract_player_names: resetContractDraftPlayers,
      requested_history_category: synchronizedHistory.changed ? "Draft" : null,
      expected_before_history: synchronizedHistory.changed ? history.competitions.Draft : null,
      next_history: synchronizedHistory.changed ? synchronizedHistory.entries : null,
      movement_type: operationType,
      movement_summary: movementSummary,
    })
    : synchronizedHistory.changed
      ? await supabase.rpc("apply_league_state_and_history_movement", {
        expected_before_state: originalState,
        next_state: nextState,
        history_category: "Draft",
        expected_before_history: history.competitions.Draft,
        next_history: synchronizedHistory.entries,
        movement_type: operationType,
        movement_summary: movementSummary,
      })
      : await persistLeagueMovement(
        supabase,
        originalState,
        nextState,
        operationType,
        movementSummary,
      );
  if (response.error) fail(response.error.message);
  ["/squadre", "/giocatori", "/movimenti", "/storico", "/admin", path, "/admin/draft", "/admin/contratti", "/admin/posizioni-draft"]
    .forEach((route) => revalidatePath(route));
  redirect(`${path}?updated=${encodeURIComponent(provisionalSignAndTrade ? "Sign and trade registrato." : "Scambio registrato.")}`);

  function scheduledCost(entry: (typeof state.rosterEntries)[number], targetSeason: string) {
    return 1000 - calculateCapSpace({
      entries: [entry],
      seasonName: targetSeason,
      optionSeasonName: season.name,
      countTeamOptions,
    });
  }

  function teamCapSpaces(entries: typeof state.rosterEntries, teamCode: string) {
    return capSeasons.map((targetSeason, index) => calculateCapSpace({
      entries: entries.filter((entry) => entry.teamCode === teamCode && (
        index !== 0 || entry.state !== "active" || entry.slot !== "dpe"
      )),
      seasonName: targetSeason,
      optionSeasonName: season.name,
      countTeamOptions,
    }));
  }
}

function isLaterDraftPick(counterpartyYear: number, counterpartyRound: string, subjectYear: number, subjectRound: string) {
  if (counterpartyYear > subjectYear) return true;
  return counterpartyYear === subjectYear
    && subjectRound.trim().startsWith("1")
    && counterpartyRound.trim().startsWith("2");
}

function tradePickLabel(pick: { year: number; round: string; originTeamCode?: string; originOrOverall: string | number }) {
  return `${pick.year} ${pick.round}, Orig/pos ${pick.originTeamCode ?? pick.originOrOverall}`;
}

function tradeClauseLabel(clause: string | null) {
  if (!clause) return "nessuna clausola";
  if (clause === "swap") return "diritto di swap";
  return clause.replace("protected_top_", "protetta top ");
}

function tradeSlotLabel(slot: string) {
  if (slot === "regular") return "Roster";
  if (slot === "two_way") return "Two-way";
  if (slot === "g_league") return "G-League";
  if (slot === "dpe") return "DPE";
  return slot;
}

function parsePayload(value: FormDataEntryValue | null): TradeTransactionPayload {
  const parsed = JSON.parse(String(value ?? "")) as Partial<TradeTransactionPayload> | null;
  if (!parsed || typeof parsed !== "object") throw new Error("Scambio non valido.");
  const arrayFields = ["participantCodes", "playerMoves", "pickMoves", "pickClauses", "qualifyingOfferMoves", "existingClauseChanges", "cuts", "promotions"] as const;
  if (arrayFields.some((field) => !Array.isArray(parsed[field]))) throw new Error("Dati dello scambio incompleti.");
  const payload = parsed as TradeTransactionPayload;
  if (payload.signAndTrade === undefined) throw new Error("Dati del sign and trade mancanti.");
  if (payload.signAndTrade !== null) validateSignAndTradeRequest(payload.signAndTrade);
  if (payload.participantCodes.some((code) => typeof code !== "string")) throw new Error("Squadre dello scambio non valide.");
  const slots: TradeSlot[] = ["regular", "two_way", "g_league", "dpe"];
  for (const move of payload.playerMoves) {
    if (!isRecord(move) || !textFields(move, "id", "fromTeamCode", "toTeamCode") || !slots.includes(move.destinationSlot as TradeSlot)) {
      throw new Error("Giocatore dello scambio non valido.");
    }
  }
  for (const move of payload.pickMoves) {
    if (!isRecord(move) || !textFields(move, "id", "fromTeamCode", "toTeamCode")) throw new Error("Scelta dello scambio non valida.");
  }
  for (const agreement of payload.pickClauses) {
    if (
      !isRecord(agreement)
      || !textFields(agreement, "id", "pickId", "pickOwnerTeamCode", "beneficiaryTeamCode")
      || typeof agreement.clause !== "string"
      || !/^(swap|protected_top_(?:[1-9]|1[0-3]))$/.test(agreement.clause)
      || !nullableText(agreement.counterpartyPickId)
      || !nullableText(agreement.counterpartyTeamCode)
    ) throw new Error("Clausola dello scambio non valida.");
  }
  for (const move of payload.qualifyingOfferMoves) {
    if (!isRecord(move) || !textFields(move, "id", "fromTeamCode", "toTeamCode")) throw new Error("Qualifying offer dello scambio non valida.");
  }
  for (const change of payload.existingClauseChanges) {
    if (
      !isRecord(change)
      || !textFields(change, "agreementId", "action")
      || change.action !== "remove"
      || change.clause !== null
    ) throw new Error("Modifica dell'accordo non valida.");
  }
  for (const cut of payload.cuts) {
    if (!isRecord(cut) || !textFields(cut, "id", "teamCode")) throw new Error("Taglio contestuale non valido.");
  }
  for (const promotion of payload.promotions ?? []) {
    if (
      !isRecord(promotion)
      || !textFields(promotion, "id", "teamCode", "destinationSlot")
      || !["regular", "two_way", "g_league"].includes(String(promotion.destinationSlot))
    ) throw new Error("Promozione contestuale non valida.");
  }
  return payload;
}

function validateSignAndTradeRequest(value: unknown): asserts value is SignAndTradeRequest {
  if (!isRecord(value) || !textFields(value, "kind", "playerName", "signerTeamCode", "destinationSlot")) {
    throw new Error("Dati del sign and trade incompleti.");
  }
  if (value.kind === "free_agent") {
    if (
      !["list", "outside"].includes(String(value.playerSource))
      || !Number.isInteger(value.price)
      || !["regular", "two_way"].includes(String(value.destinationSlot))
      || typeof value.buyoutTopSixConfirmed !== "boolean"
      || typeof value.playerRole !== "string"
      || !["G", "A", "C", "X", ""].includes(value.playerRole)
      || typeof value.realTeam !== "string"
    ) throw new Error("Firma free agent del sign and trade non valida.");
    return;
  }
  throw new Error("Tipo di sign and trade non valido.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function textFields(value: Record<string, unknown>, ...fields: string[]) {
  return fields.every((field) => typeof value[field] === "string" && Boolean((value[field] as string).trim()));
}

function nullableText(value: unknown) {
  return value === null || (typeof value === "string" && Boolean(value.trim()));
}

function hasDraftCondition(pick: { label: string; clauseResolution?: unknown }) {
  return Boolean(pick.clauseResolution) || /protetta|swap|contropartita|c\.p\./i.test(pick.label);
}

function fail(message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
