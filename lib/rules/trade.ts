import { validateSlots, type SlotCounts } from "./roster";
import { result } from "./types";

export type TradeSlot = "regular" | "two_way" | "g_league" | "dpe";
export type TradeRole = "G" | "A" | "C";
export type TradePickClause = "none" | "swap" | `protected_top_${number}`;

export type TradeTeamState = {
  code: string;
  currentCost: number;
  futureCosts?: { seasonName: string; currentCost: number }[];
  slots: SlotCounts;
  roles: Record<TradeRole, number>;
};

export type TradePlayerMove = {
  id: string;
  fromTeamCode: string;
  toTeamCode: string;
  cost: number;
  capCost: number;
  futureCapCosts?: Record<string, number>;
  role: TradeRole | null;
  sourceSlot: TradeSlot;
  destinationSlot: TradeSlot;
  allowedDestinationSlots?: TradeSlot[];
  sourceState?: "active" | "cut";
};

export type TradeCut = {
  id: string;
  teamCode: string;
  cost: number;
  role: TradeRole | null;
  slot: TradeSlot;
};

export type TradePromotion = {
  id: string;
  teamCode: string;
  sourceSlot: Exclude<TradeSlot, "dpe">;
  destinationSlot: Exclude<TradeSlot, "dpe">;
  allowedDestinationSlots?: Exclude<TradeSlot, "dpe">[];
};

export type TradePickMove = {
  id: string;
  fromTeamCode: string;
  toTeamCode: string;
  year: number;
  round: string;
  hasExistingCondition: boolean;
  clause: TradePickClause;
  counterpartyPickId: string | null;
  counterpartyYear: number | null;
  counterpartyRound: string | null;
  counterpartyHasExistingCondition: boolean;
};

export type TradePickClauseAgreement = {
  id: string;
  pickId: string;
  pickOwnerTeamCode: string;
  beneficiaryTeamCode: string;
  year: number;
  round: string;
  hasExistingCondition: boolean;
  clause: TradePickClause;
  counterpartyPickId: string | null;
  counterpartyYear: number | null;
  counterpartyRound: string | null;
  counterpartyHasExistingCondition: boolean;
  counterpartyOwnerTeamCode?: string | null;
  postTradeOwnerTeamCode?: string;
  counterpartyPostTradeOwnerTeamCode?: string | null;
  subjectWasTraded?: boolean;
  subjectTradeFromTeamCode?: string | null;
};

export type TradeExistingClauseChange = {
  agreementId: string;
  subjectOwnerTeamCode: string;
  counterpartyOwnerTeamCode: string;
  subjectYear: number;
  counterpartyYear: number;
  subjectRound: string;
  counterpartyRound: string;
  action: "remove" | "modify";
  clause: Exclude<TradePickClause, "none"> | null;
};

export type TradeQualifyingOfferMove = {
  id: string;
  fromTeamCode: string;
  toTeamCode: string;
};

export function allowedTradeDestinations(sourceSlot: TradeSlot): TradeSlot[] {
  if (sourceSlot === "two_way") return ["two_way", "regular"];
  if (sourceSlot === "g_league") return ["g_league", "two_way", "regular"];
  if (sourceSlot === "dpe") return ["dpe"];
  return ["regular"];
}

export function evaluateTrade(input: {
  phase: string;
  tradeDeadlinePassed?: boolean;
  tradesOpen?: boolean;
  enforceRoleMinimums?: boolean;
  enforceOffseasonCap?: boolean;
  tradableDraftYears?: number[];
  protectionCounterpartyDraftYears?: number[];
  teams: TradeTeamState[];
  playerMoves: TradePlayerMove[];
  pickMoves: TradePickMove[];
  pickClauses?: TradePickClauseAgreement[];
  existingClauseChanges?: TradeExistingClauseChange[];
  qualifyingOfferMoves?: TradeQualifyingOfferMove[];
  qualifyingOfferTransfersOpen?: boolean;
  cuts: TradeCut[];
  promotions?: TradePromotion[];
}) {
  const errors: { code: string; message: string }[] = [];
  const warnings: { code: string; message: string }[] = [];

  if (input.tradesOpen === false && !(input.phase === "regular_season" && input.tradeDeadlinePassed)) {
    errors.push({ code: "TRADES_CLOSED", message: "Gli scambi non sono disponibili in questo momento della lega." });
  }
  if (input.phase === "regular_season" && input.tradeDeadlinePassed) {
    errors.push({
      code: "TRADES_CLOSED_AFTER_DEADLINE",
      message: "Il mercato degli scambi è chiuso dopo la trade deadline.",
    });
  }
  if (input.teams.length < 2) {
    errors.push({ code: "TRADE_TEAMS_MINIMUM", message: "Lo scambio deve coinvolgere almeno due squadre." });
  }
  if (new Set(input.teams.map((team) => team.code)).size !== input.teams.length) {
    errors.push({ code: "TRADE_TEAM_DUPLICATE", message: "Ogni squadra può comparire una sola volta." });
  }
  if (
    input.playerMoves.length
    + input.pickMoves.length
    + (input.pickClauses?.length ?? 0)
    + (input.existingClauseChanges?.length ?? 0)
    + (input.qualifyingOfferMoves?.length ?? 0)
    === 0
  ) {
    errors.push({ code: "TRADE_ASSET_REQUIRED", message: "Aggiungi almeno un elemento allo scambio." });
  }

  const seenPlayers = new Set<string>();
  for (const move of input.playerMoves) {
    if (seenPlayers.has(move.id)) {
      errors.push({ code: "TRADE_PLAYER_DUPLICATE", message: "Lo stesso giocatore non può essere inserito due volte." });
    }
    seenPlayers.add(move.id);
    if (move.sourceState === "cut") {
      errors.push({
        code: "TRADE_CUT_CONTRACT_NOT_TRADABLE",
        message: "I contratti dei giocatori già tagliati non possono essere scambiati.",
      });
    }
    if (move.fromTeamCode === move.toTeamCode) {
      errors.push({ code: "TRADE_SAME_TEAM", message: "La destinazione deve essere una squadra diversa." });
    }
    const permittedDestinations = move.allowedDestinationSlots ?? allowedTradeDestinations(move.sourceSlot);
    if (!permittedDestinations.includes(move.destinationSlot)) {
      errors.push({
        code: "TRADE_SLOT_DOWNGRADE",
        message: "La destinazione scelta non è consentita per lo slot di provenienza del giocatore.",
      });
    }
  }

  const seenPicks = new Set<string>();
  const conditionedPicks = new Set<string>();
  for (const move of input.pickMoves) {
    if (seenPicks.has(move.id)) {
      errors.push({ code: "TRADE_PICK_DUPLICATE", message: "La stessa scelta non può essere inserita due volte." });
    }
    seenPicks.add(move.id);
    if (move.fromTeamCode === move.toTeamCode) {
      errors.push({ code: "TRADE_PICK_SAME_TEAM", message: "La scelta deve essere ceduta a un’altra squadra." });
    }
    if (input.tradableDraftYears && !input.tradableDraftYears.includes(move.year)) {
      errors.push({
        code: "TRADE_PICK_YEAR_NOT_ALLOWED",
        message: `Si possono scambiare soltanto le scelte dei prossimi tre Draft: ${input.tradableDraftYears.join(", ")}.`,
      });
    }
    const allowedMoveCounterpartyYears = move.clause.startsWith("protected_top_")
      ? input.protectionCounterpartyDraftYears ?? input.tradableDraftYears
      : input.tradableDraftYears;
    if (allowedMoveCounterpartyYears && move.counterpartyYear !== null && !allowedMoveCounterpartyYears.includes(move.counterpartyYear)) {
      errors.push({
        code: "TRADE_PICK_COUNTERPART_YEAR_NOT_ALLOWED",
        message: `La contropartita non appartiene alla finestra consentita: ${allowedMoveCounterpartyYears.join(", ")}.`,
      });
    }
    if (move.hasExistingCondition) conditionedPicks.add(move.id);
    if (move.clause !== "none") {
      if (move.hasExistingCondition) {
        errors.push({
          code: "TRADE_PICK_ALREADY_CONDITIONED",
          message: "Una scelta già vincolata non può essere coinvolta in un nuovo accordo.",
        });
      }
      if (move.clause === "swap" && !move.counterpartyPickId) {
        errors.push({
          code: "TRADE_PICK_COUNTERPART_REQUIRED",
          message: "Il diritto di swap richiede una scelta di contropartita.",
        });
      }
      if (move.counterpartyHasExistingCondition) {
        errors.push({
          code: "TRADE_PICK_COUNTERPART_ALREADY_CONDITIONED",
          message: "La scelta indicata come contropartita è già coinvolta in un altro accordo.",
        });
      }
      if (
        move.clause === "swap"
        && (move.year !== move.counterpartyYear || move.round !== move.counterpartyRound)
      ) {
        errors.push({
          code: "TRADE_SWAP_COUNTERPART_INVALID",
          message: "La contropartita dello swap deve appartenere allo stesso anno e allo stesso giro.",
        });
      }
      if (
        move.clause.startsWith("protected_top_")
        && move.counterpartyYear !== null
        && move.counterpartyYear < move.year
      ) {
        errors.push({
          code: "TRADE_PROTECTION_COUNTERPART_INVALID",
          message: "La contropartita della protezione non può appartenere a un draft precedente.",
        });
      }
      if (conditionedPicks.has(move.id)) {
        errors.push({
          code: "TRADE_PICK_MULTIPLE_CONDITIONS",
          message: "La stessa scelta non può essere coinvolta in più accordi di protezione o swap.",
        });
      }
      conditionedPicks.add(move.id);
      if (move.counterpartyPickId) {
        if (conditionedPicks.has(move.counterpartyPickId)) {
          errors.push({
            code: "TRADE_PICK_COUNTERPART_MULTIPLE_CONDITIONS",
            message: "La scelta indicata come contropartita è già coinvolta in un altro accordo.",
          });
        }
        conditionedPicks.add(move.counterpartyPickId);
      }
    }
  }

  for (const agreement of input.pickClauses ?? []) {
    if (agreement.clause === "none") {
      errors.push({
        code: "TRADE_PICK_CLAUSE_REQUIRED",
        message: "Seleziona il tipo di clausola da inserire.",
      });
      continue;
    }
    if (input.tradableDraftYears && !input.tradableDraftYears.includes(agreement.year)) {
      errors.push({
        code: "TRADE_PICK_CLAUSE_YEAR_NOT_ALLOWED",
        message: `Le clausole possono riguardare soltanto i prossimi tre Draft: ${input.tradableDraftYears.join(", ")}.`,
      });
    }
    const allowedCounterpartyYears = agreement.clause.startsWith("protected_top_")
      ? input.protectionCounterpartyDraftYears ?? input.tradableDraftYears
      : input.tradableDraftYears;
    if (allowedCounterpartyYears && agreement.counterpartyYear !== null && !allowedCounterpartyYears.includes(agreement.counterpartyYear)) {
      errors.push({
        code: "TRADE_PICK_CLAUSE_COUNTERPART_YEAR_NOT_ALLOWED",
        message: agreement.clause.startsWith("protected_top_")
          ? `La contropartita di una protezione può appartenere al massimo al quarto Draft successivo: ${allowedCounterpartyYears.join(", ")}.`
          : `La contropartita deve appartenere a uno dei prossimi tre Draft: ${allowedCounterpartyYears.join(", ")}.`,
      });
    }
    if (agreement.hasExistingCondition || conditionedPicks.has(agreement.pickId)) {
      errors.push({
        code: "TRADE_PICK_ALREADY_CONDITIONED",
        message: "La scelta selezionata è già coinvolta in un'altra clausola.",
      });
    }
    if (agreement.clause === "swap" && !agreement.counterpartyPickId) {
      errors.push({
        code: "TRADE_PICK_COUNTERPART_REQUIRED",
        message: "Il diritto di swap richiede una scelta di contropartita.",
      });
    }
    if (agreement.clause.startsWith("protected_top_") && !agreement.counterpartyPickId) {
      errors.push({
        code: "TRADE_PROTECTION_COUNTERPART_REQUIRED",
        message: "La protezione richiede una scelta di contropartita.",
      });
    }
    const subjectPostTradeOwner = agreement.postTradeOwnerTeamCode ?? agreement.pickOwnerTeamCode;
    const counterpartyPostTradeOwner = agreement.counterpartyPostTradeOwnerTeamCode
      ?? agreement.counterpartyOwnerTeamCode;
    const protectionTeam = agreement.subjectTradeFromTeamCode ?? agreement.pickOwnerTeamCode;
    if (agreement.clause.startsWith("protected_top_") && agreement.subjectWasTraded === false) {
      errors.push({
        code: "TRADE_PROTECTION_SUBJECT_NOT_TRADED",
        message: "Una protezione può essere inserita soltanto su una scelta ceduta nello stesso scambio.",
      });
    }
    if (
      agreement.clause.startsWith("protected_top_")
      && counterpartyPostTradeOwner
      && counterpartyPostTradeOwner !== protectionTeam
    ) {
      errors.push({
        code: "TRADE_PROTECTION_COUNTERPART_OWNER_INVALID",
        message: "La contropartita della protezione deve appartenere alla squadra che sta cedendo la scelta protetta.",
      });
    }
    if (
      agreement.clause === "swap"
      && counterpartyPostTradeOwner
      && counterpartyPostTradeOwner === subjectPostTradeOwner
    ) {
      errors.push({
        code: "TRADE_SWAP_COUNTERPART_OWNER_INVALID",
        message: "La contropartita dello swap deve appartenere a un'altra squadra.",
      });
    }
    if (agreement.counterpartyHasExistingCondition) {
      errors.push({
        code: "TRADE_PICK_COUNTERPART_ALREADY_CONDITIONED",
        message: "La scelta indicata come contropartita è già coinvolta in un altro accordo.",
      });
    }
    if (
      agreement.clause === "swap"
      && agreement.counterpartyPickId
      && (agreement.year !== agreement.counterpartyYear || agreement.round !== agreement.counterpartyRound)
    ) {
      errors.push({
        code: "TRADE_SWAP_COUNTERPART_INVALID",
        message: "La contropartita dello swap deve appartenere allo stesso anno e allo stesso giro.",
      });
    }
    if (
      agreement.clause.startsWith("protected_top_")
      && !isPickAfter(agreement.counterpartyYear, agreement.counterpartyRound, agreement.year, agreement.round)
    ) {
      errors.push({
        code: "TRADE_PROTECTION_COUNTERPART_INVALID",
        message: "La contropartita della protezione non può appartenere a un draft precedente.",
      });
    }

    conditionedPicks.add(agreement.pickId);
    if (agreement.counterpartyPickId) {
      if (conditionedPicks.has(agreement.counterpartyPickId)) {
        errors.push({
          code: "TRADE_PICK_COUNTERPART_MULTIPLE_CONDITIONS",
          message: "La scelta indicata come contropartita è già coinvolta in un altro accordo.",
        });
      }
      conditionedPicks.add(agreement.counterpartyPickId);
    }
  }

  const changedAgreements = new Set<string>();
  for (const change of input.existingClauseChanges ?? []) {
    if (changedAgreements.has(change.agreementId)) {
      errors.push({ code: "TRADE_EXISTING_CLAUSE_DUPLICATE", message: "Lo stesso accordo può essere modificato una sola volta nello scambio." });
    }
    changedAgreements.add(change.agreementId);
    const participantCodes = new Set(input.teams.map((team) => team.code));
    if (
      !participantCodes.has(change.subjectOwnerTeamCode)
      || !participantCodes.has(change.counterpartyOwnerTeamCode)
    ) {
      errors.push({
        code: "TRADE_EXISTING_CLAUSE_TEAMS_REQUIRED",
        message: "Un accordo esistente può essere modificato o eliminato soltanto se allo scambio partecipano entrambi gli attuali detentori delle scelte interessate.",
      });
    }
    if (change.action !== "remove" || change.clause !== null) {
      errors.push({ code: "TRADE_EXISTING_CLAUSE_REMOVE_ONLY", message: "Le clausole esistenti possono soltanto essere rimosse." });
    }
    if (change.action === "modify" && !change.clause) {
      errors.push({ code: "TRADE_EXISTING_CLAUSE_VALUE_REQUIRED", message: "Seleziona la nuova condizione dell'accordo." });
    }
    if (change.clause === "swap" && (
      change.subjectYear !== change.counterpartyYear
      || change.subjectRound !== change.counterpartyRound
    )) {
      errors.push({ code: "TRADE_EXISTING_SWAP_INVALID", message: "Questo accordo non può diventare uno swap: le due scelte non appartengono allo stesso draft e giro." });
    }
    if (change.clause?.startsWith("protected_top_") && change.counterpartyYear < change.subjectYear) {
      errors.push({ code: "TRADE_EXISTING_PROTECTION_INVALID", message: "La contropartita della protezione non può appartenere a un draft precedente." });
    }
    const allowedCounterpartyYears = change.clause?.startsWith("protected_top_")
      ? input.protectionCounterpartyDraftYears ?? input.tradableDraftYears
      : input.tradableDraftYears;
    if (
      change.action === "modify"
      && input.tradableDraftYears
      && !input.tradableDraftYears.includes(change.subjectYear)
    ) {
      errors.push({ code: "TRADE_EXISTING_CLAUSE_YEAR_NOT_ALLOWED", message: "L'accordo può essere modificato soltanto se la scelta principale rientra nei prossimi tre draft." });
    }
    if (
      change.action === "modify"
      && allowedCounterpartyYears
      && !allowedCounterpartyYears.includes(change.counterpartyYear)
    ) {
      errors.push({ code: "TRADE_EXISTING_CLAUSE_COUNTERPART_YEAR_NOT_ALLOWED", message: "La contropartita non rientra nella finestra di draft consentita." });
    }
  }

  const seenQualifyingOffers = new Set<string>();
  for (const move of input.qualifyingOfferMoves ?? []) {
    if (seenQualifyingOffers.has(move.id)) {
      errors.push({
        code: "TRADE_QO_DUPLICATE",
        message: "La stessa qualifying offer non può essere trasferita due volte.",
      });
    }
    seenQualifyingOffers.add(move.id);
    if (move.fromTeamCode === move.toTeamCode) {
      errors.push({
        code: "TRADE_QO_SAME_TEAM",
        message: "La qualifying offer deve essere trasferita a un'altra squadra.",
      });
    }
    if (input.qualifyingOfferTransfersOpen === false || input.phase !== "offseason") {
      errors.push({
        code: "TRADE_QO_OFFSEASON_ONLY",
        message: "Le qualifying offer per la prossima asta si possono scambiare soltanto in offseason.",
      });
    }
  }

  const seenCuts = new Set<string>();
  for (const cut of input.cuts) {
    if (seenCuts.has(cut.id) || seenPlayers.has(cut.id)) {
      errors.push({
        code: "TRADE_CUT_DUPLICATE",
        message: "Un giocatore non può essere contemporaneamente ceduto e tagliato.",
      });
    }
    seenCuts.add(cut.id);
  }

  const seenPromotions = new Set<string>();
  for (const promotion of input.promotions ?? []) {
    if (seenPromotions.has(promotion.id) || seenPlayers.has(promotion.id) || seenCuts.has(promotion.id)) {
      errors.push({
        code: "TRADE_PROMOTION_DUPLICATE",
        message: "Un giocatore non può essere contemporaneamente ceduto, tagliato e spostato.",
      });
    }
    seenPromotions.add(promotion.id);
    const permittedDestinations = promotion.allowedDestinationSlots
      ?? (["regular", "two_way", "g_league"] as Exclude<TradeSlot, "dpe">[]).filter((slot) => slot !== promotion.sourceSlot);
    if (
      promotion.sourceSlot === promotion.destinationSlot
      || !permittedDestinations.includes(promotion.destinationSlot)
    ) {
      errors.push({
        code: "TRADE_PROMOTION_INVALID",
        message: "Lo spostamento contestuale deve avere una destinazione consentita.",
      });
    }
  }

  const teamResults = input.teams.map((team) => {
    const slotsBefore = { ...team.slots };
    const rolesBefore = { ...team.roles };
    const slots = { ...team.slots };
    const roles = { ...team.roles };
    let costAfter = team.currentCost;

    for (const move of input.playerMoves) {
      if (move.fromTeamCode === team.code) {
        slots[slotKey(move.sourceSlot)] -= 1;
        if (move.sourceSlot !== "dpe") costAfter -= move.capCost;
        if (move.sourceSlot !== "dpe" && move.role) roles[move.role] -= 1;
      }
      if (move.toTeamCode === team.code) {
        slots[slotKey(move.destinationSlot)] += 1;
        if (move.destinationSlot !== "dpe") costAfter += move.capCost;
        if (move.destinationSlot !== "dpe" && move.role) roles[move.role] += 1;
      }
    }

    for (const cut of input.cuts.filter((item) => item.teamCode === team.code)) {
      slots[slotKey(cut.slot)] -= 1;
      if (cut.slot === "dpe") costAfter += cut.cost;
      if (cut.slot !== "dpe" && cut.role) roles[cut.role] -= 1;
    }

    for (const promotion of (input.promotions ?? []).filter((item) => item.teamCode === team.code)) {
      slots[slotKey(promotion.sourceSlot)] -= 1;
      slots[slotKey(promotion.destinationSlot)] += 1;
    }

    const slotValidation = validateSlots(slots);
    errors.push(...slotValidation.errors.map((error) => ({
      ...error,
      code: `${error.code}_${team.code}`,
      message: `${team.code}: ${error.message}`,
    })));

    const minimums: Record<TradeRole, number> = { G: 5, A: 5, C: 3 };
    const missingRoles = (input.enforceRoleMinimums ?? input.phase === "regular_season")
      ? (Object.keys(minimums) as TradeRole[]).reduce((result, role) => ({
        ...result,
        [role]: Math.max(0, minimums[role] - roles[role]),
      }), { G: 0, A: 0, C: 0 })
      : { G: 0, A: 0, C: 0 };
    const requiredRoleFreeAgents = missingRoles.G + missingRoles.A + missingRoles.C;
    const projectedCostAfter = costAfter + requiredRoleFreeAgents;

    if ((input.enforceOffseasonCap ?? input.phase === "offseason") && projectedCostAfter > 1000 && projectedCostAfter > team.currentCost) {
      warnings.push({
        code: `TRADE_OFFSEASON_CAP_${team.code}`,
        message: `${team.code}: lo scambio porterebbe lo spazio libero sotto zero.`,
      });
    }
    if (
      input.phase === "regular_season"
      && (
        (team.currentCost <= 1100 && projectedCostAfter > 1100)
        || (team.currentCost > 1100 && projectedCostAfter > team.currentCost)
      )
    ) {
      warnings.push({
        code: `TRADE_REGULAR_SEASON_CAP_${team.code}`,
        message: `${team.code}: lo scambio aumenta il salary cap oltre il limite consentito.`,
      });
    }

    const futureCaps = (team.futureCosts ?? []).map((future) => {
      let costAfterFuture = future.currentCost;

      for (const move of input.playerMoves) {
        const futurePlayerCost = move.futureCapCosts?.[future.seasonName] ?? 0;
        if (move.fromTeamCode === team.code) costAfterFuture -= futurePlayerCost;
        if (move.toTeamCode === team.code) costAfterFuture += futurePlayerCost;
      }

      if (costAfterFuture > 1000) {
        warnings.push({
          code: `TRADE_FUTURE_CAP_${team.code}_${future.seasonName}`,
          message: `${team.code}: lo scambio porterebbe lo spazio libero ${future.seasonName} sotto zero.`,
        });
      }

      return {
        seasonName: future.seasonName,
        costBefore: future.currentCost,
        costAfter: costAfterFuture,
        spaceBefore: 1000 - future.currentCost,
        spaceAfter: 1000 - costAfterFuture,
      };
    });

    for (const role of Object.keys(minimums) as TradeRole[]) {
      if (missingRoles[role]) {
        warnings.push({
          code: `TRADE_ROLE_MINIMUM_${team.code}_${role}`,
          message: `${team.code}: dopo lo scambio mancano ${missingRoles[role]} giocatori di ruolo ${role}; va assegnato un free agent casuale da 1 credito per ogni carenza.`,
        });
      }
    }

    return {
      code: team.code,
      costBefore: team.currentCost,
      costAfter: projectedCostAfter,
      spaceBefore: 1000 - team.currentCost,
      spaceAfter: 1000 - projectedCostAfter,
      slotsBefore,
      slots,
      rolesBefore,
      roles,
      missingRoles,
      requiredRoleFreeAgents,
      futureCaps,
    };
  });

  return result(
    { teamResults },
    ["2(a-c)", "9(a-e)", "10(a-b)", "11(f-j)", "13(a-i)", "14(a-e)"],
    errors,
    warnings,
  );
}

function slotKey(slot: TradeSlot): keyof SlotCounts {
  if (slot === "two_way") return "twoWay";
  if (slot === "g_league") return "gLeague";
  return slot;
}

function isPickAfter(
  counterpartyYear: number | null,
  counterpartyRound: string | null,
  subjectYear: number,
  subjectRound: string,
) {
  if (counterpartyYear === null || counterpartyRound === null) return false;
  if (counterpartyYear > subjectYear) return true;
  return counterpartyYear === subjectYear
    && subjectRound.trim().startsWith("1")
    && counterpartyRound.trim().startsWith("2");
}
