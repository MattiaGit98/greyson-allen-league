import { describe, expect, it } from "vitest";
import { allowedTradeDestinations, evaluateTrade, type TradeTeamState } from "./trade";

const teams: TradeTeamState[] = [
  {
    code: "AAA",
    currentCost: 700,
    slots: { regular: 15, twoWay: 1, gLeague: 1, dpe: 0 },
    roles: { G: 5, A: 5, C: 5 },
  },
  {
    code: "BBB",
    currentCost: 650,
    slots: { regular: 15, twoWay: 1, gLeague: 0, dpe: 0 },
    roles: { G: 5, A: 5, C: 5 },
  },
  {
    code: "CCC",
    currentCost: 600,
    slots: { regular: 14, twoWay: 0, gLeague: 1, dpe: 0 },
    roles: { G: 5, A: 5, C: 4 },
  },
];

describe("trade rules", () => {
  it("keeps a regular-season trade registrable while pricing the mandatory role restoration", () => {
    const result = evaluateTrade({
      phase: "regular_season",
      teams: [teams[0], { ...teams[1], slots: { ...teams[1].slots, regular: 14 } }],
      playerMoves: [{
        id: "guard-out",
        fromTeamCode: "AAA",
        toTeamCode: "BBB",
        cost: 20,
        capCost: 20,
        role: "G",
        sourceSlot: "regular",
        destinationSlot: "regular",
      }],
      pickMoves: [],
      cuts: [],
    });

    expect(result.valid).toBe(true);
    expect(result.calculated.teamResults.find((team) => team.code === "AAA")).toMatchObject({
      missingRoles: { G: 1, A: 0, C: 0 },
      requiredRoleFreeAgents: 1,
      costAfter: 681,
      spaceAfter: 319,
    });
    expect(result.warnings.some((warning) => warning.code === "TRADE_ROLE_MINIMUM_AAA_G")).toBe(true);
  });

  it("includes the mandatory role-restoration credit in the cap check", () => {
    const result = evaluateTrade({
      phase: "regular_season",
      teams: [{ ...teams[0], currentCost: 1100 }, { ...teams[1], slots: { ...teams[1].slots, regular: 14 } }],
      playerMoves: [{
        id: "guard-out",
        fromTeamCode: "AAA",
        toTeamCode: "BBB",
        cost: 0,
        capCost: 0,
        role: "G",
        sourceSlot: "regular",
        destinationSlot: "regular",
      }],
      pickMoves: [],
      cuts: [],
    });

    expect(result.warnings.some((warning) => warning.code === "TRADE_REGULAR_SEASON_CAP_AAA")).toBe(true);
  });

  it("detects a role shortage even when the team has well over 13 players", () => {
    const result = evaluateTrade({
      phase: "regular_season",
      enforceRoleMinimums: true,
      teams: [{
        ...teams[0],
        slots: { regular: 15, twoWay: 2, gLeague: 0, dpe: 0 },
        roles: { G: 7, A: 4, C: 6 },
      }],
      playerMoves: [],
      pickMoves: [],
      cuts: [],
    });

    expect(result.calculated.teamResults[0]).toMatchObject({
      missingRoles: { G: 0, A: 1, C: 0 },
      requiredRoleFreeAgents: 1,
    });
  });

  it("allows the destinations required for Two-way and G-League players", () => {
    expect(allowedTradeDestinations("two_way")).toEqual(["two_way", "regular"]);
    expect(allowedTradeDestinations("g_league")).toEqual(["g_league", "two_way", "regular"]);
    expect(allowedTradeDestinations("regular")).toEqual(["regular"]);
    expect(allowedTradeDestinations("dpe")).toEqual(["dpe"]);
  });

  it("consente una retrocessione via scambio soltanto quando la finestra specifica l'ha autorizzata", () => {
    const openWindow = evaluateTrade({
      phase: "offseason",
      teams: teams.slice(0, 2),
      playerMoves: [{
        id: "player",
        fromTeamCode: "AAA",
        toTeamCode: "BBB",
        cost: 5,
        capCost: 5,
        role: "G",
        sourceSlot: "regular",
        destinationSlot: "two_way",
        allowedDestinationSlots: ["regular", "two_way"],
      }],
      pickMoves: [],
      cuts: [],
    });
    const closedWindow = evaluateTrade({
      phase: "offseason",
      teams: teams.slice(0, 2),
      playerMoves: [{
        id: "player",
        fromTeamCode: "AAA",
        toTeamCode: "BBB",
        cost: 5,
        capCost: 5,
        role: "G",
        sourceSlot: "regular",
        destinationSlot: "two_way",
        allowedDestinationSlots: ["regular"],
      }],
      pickMoves: [],
      cuts: [],
    });
    expect(openWindow.errors.some((error) => error.code === "TRADE_SLOT_DOWNGRADE")).toBe(false);
    expect(closedWindow.errors.some((error) => error.code === "TRADE_SLOT_DOWNGRADE")).toBe(true);
  });

  it("supports a circular trade involving three teams", () => {
    const result = evaluateTrade({
      phase: "offseason",
      teams,
      playerMoves: [
        {
          id: "a",
          fromTeamCode: "AAA",
          toTeamCode: "BBB",
          cost: 20,
          capCost: 20,
          role: "G",
          sourceSlot: "regular",
          destinationSlot: "regular",
        },
        {
          id: "b",
          fromTeamCode: "BBB",
          toTeamCode: "CCC",
          cost: 30,
          capCost: 30,
          role: "A",
          sourceSlot: "regular",
          destinationSlot: "regular",
        },
        {
          id: "c",
          fromTeamCode: "CCC",
          toTeamCode: "AAA",
          cost: 10,
          capCost: 10,
          role: "C",
          sourceSlot: "regular",
          destinationSlot: "regular",
        },
      ],
      pickMoves: [],
      cuts: [],
    });

    expect(result.errors.some((error) => error.code === "TRADE_FUTURE_CAP_AAA_2027/28")).toBe(false);
    expect(result.calculated.teamResults.find((team) => team.code === "AAA")?.spaceAfter).toBe(310);
  });

  it("lets a cut free a roster place without reducing the cap cost", () => {
    const result = evaluateTrade({
      phase: "offseason",
      teams: teams.slice(0, 2),
      playerMoves: [{
        id: "incoming",
        fromTeamCode: "BBB",
        toTeamCode: "AAA",
        cost: 20,
        capCost: 20,
        role: "G",
        sourceSlot: "regular",
        destinationSlot: "regular",
      }],
      pickMoves: [],
      cuts: [{ id: "cut", teamCode: "AAA", cost: 40, role: "A", slot: "regular" }],
    });

    const aaa = result.calculated.teamResults.find((team) => team.code === "AAA");
    expect(aaa?.slots.regular).toBe(15);
    expect(aaa?.costAfter).toBe(720);
  });

  it("keeps a traded DPE outside current cap and restores its cost when cut", () => {
    const result = evaluateTrade({
      phase: "offseason",
      teams: [
        { ...teams[0], slots: { ...teams[0].slots, dpe: 1 } },
        { ...teams[1], slots: { ...teams[1].slots, dpe: 1 } },
      ],
      playerMoves: [{
        id: "dpe-traded",
        fromTeamCode: "AAA",
        toTeamCode: "BBB",
        cost: 100,
        capCost: 100,
        role: "G",
        sourceSlot: "dpe",
        destinationSlot: "dpe",
      }],
      pickMoves: [],
      cuts: [{ id: "dpe-cut", teamCode: "BBB", cost: 80, role: "C", slot: "dpe" }],
    });

    expect(result.calculated.teamResults.find((team) => team.code === "AAA")?.costAfter).toBe(700);
    expect(result.calculated.teamResults.find((team) => team.code === "BBB")?.costAfter).toBe(730);
  });

  it("includes Two-way and G-League players in role totals", () => {
    const result = evaluateTrade({
      phase: "offseason",
      teams: teams.slice(0, 2),
      playerMoves: [{
        id: "two-way-guard",
        fromTeamCode: "AAA",
        toTeamCode: "BBB",
        cost: 5,
        capCost: 5,
        role: "G",
        sourceSlot: "two_way",
        destinationSlot: "regular",
      }],
      pickMoves: [],
      cuts: [{ id: "g-league-cut", teamCode: "AAA", cost: 4, role: "A", slot: "g_league" }],
    });

    const aaa = result.calculated.teamResults.find((team) => team.code === "AAA");
    const bbb = result.calculated.teamResults.find((team) => team.code === "BBB");
    expect(aaa?.roles).toEqual({ G: 4, A: 4, C: 5 });
    expect(bbb?.roles).toEqual({ G: 6, A: 5, C: 5 });
  });

  it("reports a forceable warning when a trade exceeds the cap in a future season", () => {
    const result = evaluateTrade({
      phase: "regular_season",
      teams: [
        { ...teams[0], futureCosts: [{ seasonName: "2027/28", currentCost: 990 }] },
        { ...teams[1], futureCosts: [{ seasonName: "2027/28", currentCost: 700 }] },
      ],
      playerMoves: [{
        id: "future-contract",
        fromTeamCode: "BBB",
        toTeamCode: "AAA",
        cost: 20,
        capCost: 20,
        futureCapCosts: { "2027/28": 20 },
        role: "G",
        sourceSlot: "regular",
        destinationSlot: "regular",
      }],
      pickMoves: [],
      cuts: [],
    });

    const aaa = result.calculated.teamResults.find((team) => team.code === "AAA");
    expect(aaa?.futureCaps[0].spaceAfter).toBe(-10);
    expect(result.errors.some((error) => error.code === "TRADE_FUTURE_CAP_AAA_2027/28")).toBe(false);
    expect(result.warnings.some((warning) => warning.code === "TRADE_FUTURE_CAP_AAA_2027/28")).toBe(true);
  });

  it("accepts a swap only with a counterparty from the same draft and round", () => {
    const valid = evaluateTrade({
      phase: "offseason",
      teams: teams.slice(0, 2),
      playerMoves: [],
      pickMoves: [{
        id: "pick-main",
        fromTeamCode: "AAA",
        toTeamCode: "BBB",
        year: 2027,
        round: "1° giro",
        hasExistingCondition: false,
        clause: "swap",
        counterpartyPickId: "pick-counterpart",
        counterpartyYear: 2027,
        counterpartyRound: "1° giro",
        counterpartyHasExistingCondition: false,
      }],
      cuts: [],
    });
    const invalid = evaluateTrade({
      phase: "offseason",
      teams: teams.slice(0, 2),
      playerMoves: [],
      pickMoves: [{
        id: "pick-main",
        fromTeamCode: "AAA",
        toTeamCode: "BBB",
        year: 2027,
        round: "1° giro",
        hasExistingCondition: false,
        clause: "swap",
        counterpartyPickId: "pick-counterpart",
        counterpartyYear: 2028,
        counterpartyRound: "1° giro",
        counterpartyHasExistingCondition: false,
      }],
      cuts: [],
    });

    expect(valid.valid).toBe(true);
    expect(invalid.errors.some((error) => error.code === "TRADE_SWAP_COUNTERPART_INVALID")).toBe(true);
  });

  it("blocks a new protection on a pick that is already conditioned", () => {
    const result = evaluateTrade({
      phase: "offseason",
      teams: teams.slice(0, 2),
      playerMoves: [],
      pickMoves: [{
        id: "pick-main",
        fromTeamCode: "AAA",
        toTeamCode: "BBB",
        year: 2027,
        round: "1° giro",
        hasExistingCondition: true,
        clause: "protected_top_5",
        counterpartyPickId: "pick-counterpart",
        counterpartyYear: 2028,
        counterpartyRound: "1° giro",
        counterpartyHasExistingCondition: false,
      }],
      cuts: [],
    });

    expect(result.errors.some((error) => error.code === "TRADE_PICK_ALREADY_CONDITIONED")).toBe(true);
  });

  it("blocks a protection on a pick that is not transferred in the same trade", () => {
    const result = evaluateTrade({
      phase: "offseason",
      tradableDraftYears: [2027, 2028, 2029],
      protectionCounterpartyDraftYears: [2027, 2028, 2029, 2030],
      teams: teams.slice(0, 2),
      playerMoves: [],
      pickMoves: [],
      pickClauses: [{
        id: "clause-one",
        pickId: "aaa-pick",
        pickOwnerTeamCode: "AAA",
        beneficiaryTeamCode: "BBB",
        year: 2027,
        round: "1° giro",
        hasExistingCondition: false,
        clause: "protected_top_5",
        counterpartyPickId: "aaa-2030",
        counterpartyYear: 2030,
        counterpartyRound: "1° giro",
        counterpartyHasExistingCondition: false,
        counterpartyOwnerTeamCode: "AAA",
        subjectWasTraded: false,
        subjectTradeFromTeamCode: null,
      }],
      cuts: [],
    });

    expect(result.errors.some((error) => error.code === "TRADE_PROTECTION_SUBJECT_NOT_TRADED")).toBe(true);
  });

  it("allows a protection only with a later pick retained by the transferring team", () => {
    const result = evaluateTrade({
      phase: "offseason",
      tradableDraftYears: [2027, 2028, 2029],
      protectionCounterpartyDraftYears: [2027, 2028, 2029, 2030],
      teams: teams.slice(0, 2),
      playerMoves: [],
      pickMoves: [{
        id: "aaa-pick",
        fromTeamCode: "AAA",
        toTeamCode: "BBB",
        year: 2027,
        round: "1° giro",
        hasExistingCondition: false,
        clause: "none",
        counterpartyPickId: null,
        counterpartyYear: null,
        counterpartyRound: null,
        counterpartyHasExistingCondition: false,
      }],
      pickClauses: [{
        id: "protection-one",
        pickId: "aaa-pick",
        pickOwnerTeamCode: "AAA",
        beneficiaryTeamCode: "BBB",
        year: 2027,
        round: "1° giro",
        hasExistingCondition: false,
        clause: "protected_top_5",
        counterpartyPickId: "aaa-2027-second",
        counterpartyYear: 2027,
        counterpartyRound: "2° giro",
        counterpartyHasExistingCondition: false,
        counterpartyOwnerTeamCode: "AAA",
        postTradeOwnerTeamCode: "BBB",
        counterpartyPostTradeOwnerTeamCode: "AAA",
        subjectWasTraded: true,
        subjectTradeFromTeamCode: "AAA",
      }],
      cuts: [],
    });

    expect(result.valid).toBe(true);
  });

  it("blocks a swap when the exchange leaves both picks with the same owner", () => {
    const result = evaluateTrade({
      phase: "offseason",
      teams: teams.slice(0, 2),
      playerMoves: [],
      pickMoves: [],
      pickClauses: [{
        id: "swap-one",
        pickId: "aaa-pick",
        pickOwnerTeamCode: "AAA",
        beneficiaryTeamCode: "AAA",
        year: 2027,
        round: "1° giro",
        hasExistingCondition: false,
        clause: "swap",
        counterpartyPickId: "bbb-pick",
        counterpartyYear: 2027,
        counterpartyRound: "1° giro",
        counterpartyHasExistingCondition: false,
        counterpartyOwnerTeamCode: "BBB",
        postTradeOwnerTeamCode: "AAA",
        counterpartyPostTradeOwnerTeamCode: "AAA",
        subjectWasTraded: false,
        subjectTradeFromTeamCode: null,
      }],
      cuts: [],
    });

    expect(result.errors.some((error) => error.code === "TRADE_SWAP_COUNTERPART_OWNER_INVALID")).toBe(true);
  });

  it("rejects a protection with another team's counterparty", () => {
    const result = evaluateTrade({
      phase: "offseason",
      teams: teams.slice(0, 2),
      playerMoves: [],
      pickMoves: [],
      pickClauses: [{
        id: "invalid-protection",
        pickId: "aaa-pick",
        pickOwnerTeamCode: "AAA",
        beneficiaryTeamCode: "BBB",
        year: 2027,
        round: "1° giro",
        hasExistingCondition: false,
        clause: "protected_top_5",
        counterpartyPickId: "bbb-pick",
        counterpartyYear: 2028,
        counterpartyRound: "1° giro",
        counterpartyHasExistingCondition: false,
        counterpartyOwnerTeamCode: "BBB",
      }],
      cuts: [],
    });

    expect(result.errors.some((error) => error.code === "TRADE_PROTECTION_COUNTERPART_OWNER_INVALID")).toBe(true);
  });

  it("allows removing an existing clause in a multi-team trade when both pick holders participate", () => {
    const result = evaluateTrade({
      phase: "offseason",
      teams,
      playerMoves: [],
      pickMoves: [],
      existingClauseChanges: [{
        agreementId: "agreement-one",
        subjectOwnerTeamCode: "AAA",
        counterpartyOwnerTeamCode: "BBB",
        subjectYear: 2027,
        counterpartyYear: 2028,
        subjectRound: "1° giro",
        counterpartyRound: "1° giro",
        action: "remove",
        clause: null,
      }],
      cuts: [],
    });

    expect(result.errors.some((error) => error.code === "TRADE_EXISTING_CLAUSE_TEAMS_REQUIRED")).toBe(false);
    expect(result.valid).toBe(true);
  });

  it("blocks an existing-clause change when one of the two current holders is absent", () => {
    const result = evaluateTrade({
      phase: "offseason",
      tradableDraftYears: [2027, 2028, 2029],
      teams: [teams[0], teams[2]],
      playerMoves: [],
      pickMoves: [],
      existingClauseChanges: [{
        agreementId: "agreement-one",
        subjectOwnerTeamCode: "AAA",
        counterpartyOwnerTeamCode: "BBB",
        subjectYear: 2027,
        counterpartyYear: 2028,
        subjectRound: "1° giro",
        counterpartyRound: "1° giro",
        action: "remove",
        clause: null,
      }],
      cuts: [],
    });

    expect(result.errors.some((error) => error.code === "TRADE_EXISTING_CLAUSE_TEAMS_REQUIRED")).toBe(true);
  });

  it("allows qualifying-offer trades only during the offseason", () => {
    const offseason = evaluateTrade({
      phase: "offseason",
      teams: teams.slice(0, 2),
      playerMoves: [],
      pickMoves: [],
      qualifyingOfferMoves: [{ id: "qo-player", fromTeamCode: "AAA", toTeamCode: "BBB" }],
      cuts: [],
    });
    const inSeason = evaluateTrade({
      phase: "regular_season",
      teams: teams.slice(0, 2),
      playerMoves: [],
      pickMoves: [],
      qualifyingOfferMoves: [{ id: "qo-player", fromTeamCode: "AAA", toTeamCode: "BBB" }],
      cuts: [],
    });

    expect(offseason.valid).toBe(true);
    expect(inSeason.errors.some((error) => error.code === "TRADE_QO_OFFSEASON_ONLY")).toBe(true);
  });

  it("blocks qualifying-offer trades after the auction has ended", () => {
    const result = evaluateTrade({
      phase: "offseason",
      qualifyingOfferTransfersOpen: false,
      teams: teams.slice(0, 2),
      playerMoves: [],
      pickMoves: [],
      qualifyingOfferMoves: [{ id: "qo-player", fromTeamCode: "AAA", toTeamCode: "BBB" }],
      cuts: [],
    });

    expect(result.errors.some((error) => error.code === "TRADE_QO_OFFSEASON_ONLY")).toBe(true);
  });

  it("rejects replacing an existing clause", () => {
    const result = evaluateTrade({
      phase: "offseason",
      teams,
      playerMoves: [],
      pickMoves: [],
      existingClauseChanges: [{
        agreementId: "agreement-one",
        subjectOwnerTeamCode: "AAA",
        counterpartyOwnerTeamCode: "BBB",
        subjectYear: 2027,
        counterpartyYear: 2028,
        subjectRound: "1° giro",
        counterpartyRound: "1° giro",
        action: "modify",
        clause: "protected_top_3",
      }],
      cuts: [],
    });

    expect(result.errors.some((error) => error.code === "TRADE_EXISTING_CLAUSE_REMOVE_ONLY")).toBe(true);
  });

  it("closes trades once the in-season deadline has passed", () => {
    const result = evaluateTrade({
      phase: "regular_season",
      tradeDeadlinePassed: true,
      teams: teams.slice(0, 2),
      playerMoves: [{
        id: "deadline-player",
        fromTeamCode: "AAA",
        toTeamCode: "BBB",
        cost: 10,
        capCost: 10,
        role: "G",
        sourceSlot: "regular",
        destinationSlot: "regular",
      }],
      pickMoves: [],
      cuts: [],
    });

    expect(result.errors.some((error) => error.code === "TRADES_CLOSED_AFTER_DEADLINE")).toBe(true);
  });

  it("closes the trade panel during the auction", () => {
    const result = evaluateTrade({
      phase: "offseason",
      tradesOpen: false,
      teams: teams.slice(0, 2),
      playerMoves: [],
      pickMoves: [{
        id: "pick",
        fromTeamCode: "AAA",
        toTeamCode: "BBB",
        year: 2027,
        round: "1° giro",
        hasExistingCondition: false,
        clause: "none",
        counterpartyPickId: null,
        counterpartyYear: null,
        counterpartyRound: null,
        counterpartyHasExistingCondition: false,
      }],
      cuts: [],
    });

    expect(result.errors.some((error) => error.code === "TRADES_CLOSED")).toBe(true);
  });

  it("limits traded picks to the next three drafts", () => {
    const result = evaluateTrade({
      phase: "offseason",
      tradableDraftYears: [2027, 2028, 2029],
      teams: teams.slice(0, 2),
      playerMoves: [],
      pickMoves: [{
        id: "pick-2030",
        fromTeamCode: "AAA",
        toTeamCode: "BBB",
        year: 2030,
        round: "1° giro",
        hasExistingCondition: false,
        clause: "none",
        counterpartyPickId: null,
        counterpartyYear: null,
        counterpartyRound: null,
        counterpartyHasExistingCondition: false,
      }],
      cuts: [],
    });

    expect(result.errors.some((error) => error.code === "TRADE_PICK_YEAR_NOT_ALLOWED")).toBe(true);
  });

  it("rejects a contract that was already cut", () => {
    const result = evaluateTrade({
      phase: "offseason",
      teams: teams.slice(0, 2),
      playerMoves: [{
        id: "cut-player",
        fromTeamCode: "AAA",
        toTeamCode: "BBB",
        cost: 10,
        capCost: 10,
        role: "G",
        sourceSlot: "regular",
        destinationSlot: "regular",
        sourceState: "cut",
      }],
      pickMoves: [],
      cuts: [],
    });

    expect(result.errors.some((error) => error.code === "TRADE_CUT_CONTRACT_NOT_TRADABLE")).toBe(true);
  });

  it("calcola gli spostamenti contestuali negli slot finali dello scambio", () => {
    const result = evaluateTrade({
      phase: "offseason",
      teams: [teams[0], teams[2]],
      playerMoves: [],
      pickMoves: [{
        id: "pick",
        fromTeamCode: "AAA",
        toTeamCode: "CCC",
        year: 2027,
        round: "1° giro",
        hasExistingCondition: false,
        clause: "none",
        counterpartyPickId: null,
        counterpartyYear: null,
        counterpartyRound: null,
        counterpartyHasExistingCondition: false,
      }],
      cuts: [],
      promotions: [{
        id: "g-league-player",
        teamCode: "CCC",
        sourceSlot: "g_league",
        destinationSlot: "regular",
      }],
    });

    expect(result.valid).toBe(true);
    expect(result.calculated.teamResults.find((team) => team.code === "CCC")?.slots)
      .toEqual({ regular: 15, twoWay: 0, gLeague: 0, dpe: 0 });
  });

  it("consente un downgrade contestuale soltanto tra le destinazioni autorizzate", () => {
    const base = {
      phase: "offseason",
      teams: [{ ...teams[0], slots: { regular: 14, twoWay: 1, gLeague: 1, dpe: 0 } }, teams[2]],
      playerMoves: [],
      pickMoves: [{
        id: "pick",
        fromTeamCode: "AAA",
        toTeamCode: "CCC",
        year: 2027,
        round: "1° giro",
        hasExistingCondition: false,
        clause: "none" as const,
        counterpartyPickId: null,
        counterpartyYear: null,
        counterpartyRound: null,
        counterpartyHasExistingCondition: false,
      }],
      cuts: [],
    };
    const allowed = evaluateTrade({
      ...base,
      promotions: [{
        id: "regular-player",
        teamCode: "AAA",
        sourceSlot: "regular",
        destinationSlot: "two_way",
        allowedDestinationSlots: ["two_way", "g_league"],
      }],
    });
    const blocked = evaluateTrade({
      ...base,
      promotions: [{
        id: "regular-player",
        teamCode: "AAA",
        sourceSlot: "regular",
        destinationSlot: "two_way",
        allowedDestinationSlots: [],
      }],
    });

    expect(allowed.errors.some((error) => error.code === "TRADE_PROMOTION_INVALID")).toBe(false);
    expect(allowed.calculated.teamResults.find((team) => team.code === "AAA")?.slots)
      .toEqual({ regular: 13, twoWay: 2, gLeague: 1, dpe: 0 });
    expect(blocked.errors.some((error) => error.code === "TRADE_PROMOTION_INVALID")).toBe(true);
  });
});
