"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizePlayerName } from "@/lib/admin-alerts";
import { capOverrideRequested, capOverrideSummary, requireCapOverride, salaryCapWarningsForSpaces } from "@/lib/cap-override";
import { nextDraftYear } from "@/lib/draft-positions";
import { loadHistoryCompetitionState } from "@/lib/history-competition-store";
import { loadEditableLeagueState } from "@/lib/league-state";
import { leagueMomentFromSeason, operationWindows, tradeDeadlineHasPassed } from "@/lib/league-moments";
import { persistLeagueMovement } from "@/lib/league-movements";
import { countRosterRoles } from "@/lib/rules/roster";
import {
  evaluateTrade,
  type TradeCut,
  type TradePickClauseAgreement,
  type TradePickMove,
  type TradePlayerMove,
  type TradeQualifyingOfferMove,
  type TradeSlot,
} from "@/lib/rules/trade";
import { calculateCapSpace, followingSeasonName, seasonEndYear, shouldCountTeamOptions } from "@/lib/season-time";
import { legalSlotDestinations, type ManagedRosterSlot } from "@/lib/slot-eligibility";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildSignAndTradeProvisional, type SignAndTradeRequest } from "@/lib/sign-and-trade";
import { applyStandardContractCut } from "@/lib/team-option-contract";
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
  const forceCap = capOverrideRequested(formData);
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
  if (!operationWindows.trades(moment)) fail("Gli scambi non sono disponibili durante l'asta o dopo la trade deadline.");

  const originalState = await loadEditableLeagueState();
  const draftHistory = payload.signAndTrade?.kind === "draft"
    ? (await loadHistoryCompetitionState()).competitions.Draft
    : undefined;
  let provisionalSignAndTrade: ReturnType<typeof buildSignAndTradeProvisional> | null = null;
  if (payload.signAndTrade) {
    try {
      provisionalSignAndTrade = buildSignAndTradeProvisional({
        state: originalState,
        request: payload.signAndTrade,
        seasonName: season.name,
        phase: season.status,
        moment,
        draftHistoryEntries: draftHistory,
      });
    } catch (error) {
      fail(error instanceof Error ? error.message : "Sign and trade non valido.");
    }
  }
  const state = provisionalSignAndTrade?.state ?? originalState;
  const validTeamCodes = new Set(originalState.teams.map((team) => team.code));
  const participantCodes = payload.participantCodes.map((code) => code.toUpperCase());
  if (participantCodes.length < 2 || new Set(participantCodes).size !== participantCodes.length) {
    fail("Lo scambio deve coinvolgere almeno due squadre diverse.");
  }
  if (participantCodes.some((code) => !validTeamCodes.has(code))) fail("Una delle squadre coinvolte non è valida.");
  if (provisionalSignAndTrade && !participantCodes.includes(provisionalSignAndTrade.signerTeamCode)) {
    fail("La squadra firmataria deve partecipare allo scambio.");
  }
  const participants = new Set(participantCodes);

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
  const activePlayers = new Map(state.rosterEntries.flatMap((entry, stateIndex) => (
    entry.state === "active"
      ? [[tradePlayerId(entry.teamCode, entry.name), { entry, stateIndex }] as const]
      : []
  )));
  const picks = new Map(state.draftAssets.map((pick, stateIndex) => (
    [tradePickId(pick.teamCode, stateIndex, pick), { pick, stateIndex }] as const
  )));
  const qualifyingOffers = new Map(state.qualifyingOfferRights.map((right, stateIndex) => (
    [tradeQualifyingOfferId(right.teamCode, right.playerName), { right, stateIndex }] as const
  )));

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
        { ...source.entry, slot: source.entry.slot as ManagedRosterSlot },
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
      hasExistingCondition: hasDraftCondition(source.pick),
      clause: "none",
      counterpartyPickId: null,
      counterpartyYear: null,
      counterpartyRound: null,
      counterpartyHasExistingCondition: false,
    };
  });

  const pickClauseChanges: ValidatedTradeChanges["pickClauses"] = [];
  const pickClauses: TradePickClauseAgreement[] = payload.pickClauses.map((requested) => {
    const subject = picks.get(requested.pickId);
    const counterpart = requested.counterpartyPickId ? picks.get(requested.counterpartyPickId) : undefined;
    if (!subject || subject.pick.teamCode !== requested.pickOwnerTeamCode) fail("La scelta indicata per la clausola non è più disponibile.");
    if (!participants.has(subject.pick.teamCode) || !participants.has(requested.beneficiaryTeamCode)) fail("Clausola della scelta non valida.");
    if (requested.clause === "none") fail("Seleziona il tipo di clausola.");
    if (requested.counterpartyPickId && !counterpart) fail("La contropartita della clausola non è più disponibile.");
    if (counterpart && requested.counterpartyTeamCode !== counterpart.pick.teamCode) fail("Proprietario della contropartita non valido.");
    if (counterpart && !participants.has(counterpart.pick.teamCode)) fail("La contropartita deve appartenere a una squadra coinvolta nello scambio.");
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
      hasExistingCondition: hasDraftCondition(subject.pick),
      clause: requested.clause,
      counterpartyPickId: counterpart ? requested.counterpartyPickId : null,
      counterpartyYear: counterpart?.pick.year ?? null,
      counterpartyRound: counterpart?.pick.round ?? null,
      counterpartyHasExistingCondition: counterpart ? hasDraftCondition(counterpart.pick) : false,
      counterpartyOwnerTeamCode: counterpart?.pick.teamCode ?? null,
    };
  });

  const existingAgreements = new Map(existingTradeClauseAgreements(
    state.draftAssets,
    state.teams.map((team) => team.code),
  ).map((agreement) => [agreement.agreementId, agreement]));
  const existingClauseChanges: ValidatedTradeChanges["existingClauseChanges"] = [];
  const evaluatedExistingClauseChanges = payload.existingClauseChanges.map((requested) => {
    const agreement = existingAgreements.get(requested.agreementId);
    if (!agreement) fail("L'accordo da modificare non esiste più.");
    if (!participants.has(agreement.subjectOwnerTeamCode) || !participants.has(agreement.counterpartyOwnerTeamCode)) {
      fail("Per modificare o eliminare un accordo devono partecipare entrambe le squadre interessate.");
    }
    existingClauseChanges.push({
      subjectIndex: agreement.subjectIndex,
      counterpartyIndex: agreement.counterpartyIndex,
      clause: requested.action === "remove" ? null : requested.clause,
    });
    return {
      agreementId: agreement.agreementId,
      subjectOwnerTeamCode: agreement.subjectOwnerTeamCode,
      counterpartyOwnerTeamCode: agreement.counterpartyOwnerTeamCode,
      subjectYear: agreement.subjectYear,
      counterpartyYear: agreement.counterpartyYear,
      subjectRound: agreement.round,
      counterpartyRound: agreement.round,
      action: requested.action,
      clause: requested.clause,
    };
  });

  const qualifyingChanges: ValidatedTradeChanges["qualifyingOfferMoves"] = [];
  const qualifyingOfferMoves: TradeQualifyingOfferMove[] = payload.qualifyingOfferMoves.map((requested) => {
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
    tradableDraftYears,
    protectionCounterpartyDraftYears,
    teams: tradeTeams,
    playerMoves,
    pickMoves,
    pickClauses,
    existingClauseChanges: evaluatedExistingClauseChanges,
    qualifyingOfferMoves,
    cuts,
  });
  if (!evaluation.valid) fail(evaluation.errors.map((issue) => issue.message).join(" "));
  const nextState = applyValidatedTrade(state, {
    playerMoves: playerChanges,
    pickMoves: pickChanges,
    pickClauses: pickClauseChanges,
    existingClauseChanges,
    qualifyingOfferMoves: qualifyingChanges,
    cuts: cutChanges,
  });
  const actualCapWarningsByTeam = new Map(participantCodes.map((teamCode) => {
    const before = teamCapSpaces(state.rosterEntries, teamCode);
    const after = teamCapSpaces(nextState.rosterEntries, teamCode);
    return [teamCode, salaryCapWarningsForSpaces({
      before,
      after,
      seasonNames: capSeasons,
      phase: season.status,
    })] as const;
  }));
  const dpeCutTeams = new Set(cuts.filter((cut) => cut.slot === "dpe").map((cut) => cut.teamCode));
  const blockingDpeCut = [...dpeCutTeams].flatMap((teamCode) => actualCapWarningsByTeam.get(teamCode) ?? [])[0];
  if (blockingDpeCut) fail(`Il taglio di un giocatore dalla DPE non può violare il salary cap. ${blockingDpeCut}`);
  const capWarnings = [...new Set([
    ...(provisionalSignAndTrade?.capWarnings ?? []),
    ...[...actualCapWarningsByTeam.entries()].flatMap(([teamCode, warnings]) => warnings.map((warning) => `${teamCode}: ${warning}`)),
  ])];
  requireCapOverride(capWarnings, forceCap, fail);
  const assetCount = playerMoves.length + pickMoves.length + pickClauses.length + evaluatedExistingClauseChanges.length + qualifyingOfferMoves.length;
  const operationType = provisionalSignAndTrade ? "sign_and_trade" : "scambio";
  const summary = provisionalSignAndTrade
    ? `Sign and trade ${provisionalSignAndTrade.playerName} (${provisionalSignAndTrade.signerTeamCode}) · ${participantCodes.join(" ↔ ")}: ${assetCount} elementi${cuts.length ? `; ${cuts.length} tagli contestuali` : ""}`
    : `Scambio ${participantCodes.join(" ↔ ")}: ${assetCount} elementi${cuts.length ? `; ${cuts.length} tagli contestuali` : ""}`;
  const movementSummary = capOverrideSummary(summary, capWarnings, forceCap);
  const response = provisionalSignAndTrade?.draftAssignment
    ? await supabase.rpc("apply_league_state_and_history_movement", {
      expected_before_state: originalState,
      next_state: nextState,
      history_category: "Draft",
      expected_before_history: provisionalSignAndTrade.draftHistoryBefore,
      next_history: provisionalSignAndTrade.draftHistoryAfter,
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

function parsePayload(value: FormDataEntryValue | null): TradeTransactionPayload {
  const parsed = JSON.parse(String(value ?? "")) as Partial<TradeTransactionPayload> | null;
  if (!parsed || typeof parsed !== "object") throw new Error("Scambio non valido.");
  const arrayFields = ["participantCodes", "playerMoves", "pickMoves", "pickClauses", "qualifyingOfferMoves", "existingClauseChanges", "cuts"] as const;
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
      || !["remove", "modify"].includes(String(change.action))
      || (change.action === "remove" && change.clause !== null)
      || (change.action === "modify" && (
        typeof change.clause !== "string"
        || !/^(swap|protected_top_(?:[1-9]|1[0-3]))$/.test(change.clause)
      ))
    ) throw new Error("Modifica dell'accordo non valida.");
  }
  for (const cut of payload.cuts) {
    if (!isRecord(cut) || !textFields(cut, "id", "teamCode")) throw new Error("Taglio contestuale non valido.");
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
      || typeof value.playerRole !== "string"
      || !["G", "A", "C", "X", ""].includes(value.playerRole)
      || typeof value.realTeam !== "string"
    ) throw new Error("Firma free agent del sign and trade non valida.");
    return;
  }
  if (value.kind === "draft") {
    if (!Number.isInteger(value.pickIndex) || !Number.isInteger(value.draftYear) || !["regular", "two_way", "g_league"].includes(String(value.destinationSlot))) {
      throw new Error("Scelta al Draft del sign and trade non valida.");
    }
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
