"use client";

import { useEffect, useMemo, useState } from "react";
import {
  evaluateTrade,
  type TradeCut,
  type TradeExistingClauseChange,
  type TradePickClauseAgreement,
  type TradePickClause,
  type TradePickMove,
  type TradePlayerMove,
  type TradePromotion,
  type TradeQualifyingOfferMove,
  type TradeSlot,
} from "@/lib/rules/trade";
import { countRosterRoles } from "@/lib/rules/roster";
import { getRosterSlotLimits } from "@/lib/roster-slot-limits";
import type { ExistingTradeClauseAgreement } from "@/lib/trade-state";
import { signAndTradeTransfersNewSigning, type SignAndTradeRequest } from "@/lib/sign-and-trade";
import type { TradeStretchContract, TradeStretchMove } from "@/lib/trade-stretch";
import { reconcileTradePickClauses, tradeClausePickOptions } from "@/lib/trade-clause-selection";

type RosterPlayer = {
  id: string;
  name: string;
  cost: number;
  capCost: number;
  futureCapCosts: Record<string, number>;
  contract: string;
  role: "G" | "A" | "C" | null;
  slot: TradeSlot;
  cuttable: boolean;
  stretchOptions: (2 | 3)[];
  movementDestinations: Exclude<TradeSlot, "dpe">[];
  allowedDestinations: TradeSlot[];
  newSigning?: boolean;
};

type DraftPick = {
  id: string;
  label: string;
  round: string;
  year: number;
  originOrOverall: string | number;
  hasExistingCondition: boolean;
  tradable: boolean;
  virtual?: boolean;
};

type QualifyingOffer = {
  id: string;
  playerName: string;
  amount: number;
};

type TradeTeam = {
  twoWaySlotLimit?: number;
  code: string;
  name: string;
  currentSeasonName: string;
  currentCost: number;
  futureCosts: { seasonName: string; currentCost: number }[];
  cutPlayerNames: string[];
  stretchContracts: TradeStretchContract[];
  players: RosterPlayer[];
  picks: DraftPick[];
  qualifyingOffers: QualifyingOffer[];
};

type PlayerMove = TradePlayerMove & {
  name: string;
  contract: string;
  newSigning?: boolean;
};

type PickMove = TradePickMove & {
  label: string;
  originOrOverall: string | number;
  counterpartyTitle: string | null;
  counterpartyTeamCode: string | null;
};

type PickClauseAgreement = TradePickClauseAgreement & {
  pickTitle: string;
  pickOwnerName: string;
  counterpartyTitle: string | null;
  counterpartyTeamCode: string | null;
};

type QualifyingOfferMove = TradeQualifyingOfferMove & {
  playerName: string;
  amount: number;
};

type CutMove = TradeCut & {
  name: string;
  cost: number;
  contract: string;
};

type PromotionMove = TradePromotion & {
  name: string;
};

export function TradeBuilder({
  phase,
  tradeDeadlinePassed,
  tradesOpen,
  qualifyingOfferTransfersOpen,
  enforceOffseasonCap,
  enforceRoleMinimums,
  includeDpeInRoleMinimums,
  tradableDraftYears,
  protectionCounterpartyDraftYears,
  existingClauseAgreements,
  signAndTrade,
  teams,
  mode = "admin",
  registerAction,
}: {
  phase: string;
  tradeDeadlinePassed: boolean;
  tradesOpen: boolean;
  qualifyingOfferTransfersOpen: boolean;
  enforceOffseasonCap: boolean;
  enforceRoleMinimums: boolean;
  includeDpeInRoleMinimums: boolean;
  tradableDraftYears: number[];
  protectionCounterpartyDraftYears: number[];
  existingClauseAgreements: ExistingTradeClauseAgreement[];
  signAndTrade: null | {
    request: SignAndTradeRequest;
    signerTeamCode: string;
    playerName: string;
    signingEntryId: string;
    label: string;
  };
  teams: TradeTeam[];
  mode?: "admin" | "simulator";
  registerAction?: (formData: FormData) => void | Promise<void>;
}) {
  const twoWaySlotLimit = getRosterSlotLimits(teams[0] ?? {}).two_way;
  const simulator = mode === "simulator";
  const [participantCodes, setParticipantCodes] = useState(() => {
    if (!signAndTrade) return teams.slice(0, 2).map((team) => team.code);
    const other = teams.find((team) => team.code !== signAndTrade.signerTeamCode);
    return [signAndTrade.signerTeamCode, ...(other ? [other.code] : [])];
  });
  const [playerMoves, setPlayerMoves] = useState<PlayerMove[]>([]);
  const [pickMoves, setPickMoves] = useState<PickMove[]>([]);
  const [pickClauses, setPickClauses] = useState<PickClauseAgreement[]>([]);
  const [qualifyingOfferMoves, setQualifyingOfferMoves] = useState<QualifyingOfferMove[]>([]);
  const [cuts, setCuts] = useState<CutMove[]>([]);
  const [stretches, setStretches] = useState<TradeStretchMove[]>([]);
  const [promotions, setPromotions] = useState<PromotionMove[]>([]);
  const [existingClauseChanges, setExistingClauseChanges] = useState<TradeExistingClauseChange[]>([]);
  const [roleMinimumConfirmed, setRoleMinimumConfirmed] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [recordAsCorrection, setRecordAsCorrection] = useState(false);

  useEffect(() => {
    const contracts = teams.flatMap((team) => team.stretchContracts);
    setStretches((current) => {
      const next = current.filter((stretch) => participantCodes.includes(stretch.teamCode) && contracts.some((entry) => (
        entry.id === stretch.id && entry.cost === stretch.cost && entry.contract === stretch.contract
        && entry.currentCapCost === stretch.currentCapCost && entry.stretchOptions.includes(stretch.years)
        && JSON.stringify(entry.futureCapCosts) === JSON.stringify(stretch.futureCapCosts)
      )));
      return next.length === current.length ? current : next;
    });
  }, [teams, participantCodes]);

  const participants = participantCodes
    .map((code) => teams.find((team) => team.code === code))
    .filter((team): team is TradeTeam => Boolean(team));

  const allPicks = teams.flatMap((team) => team.picks.map((pick) => ({ pick, ownerTeamCode: team.code })));
  const picksById = new Map(allPicks.map((item) => [item.pick.id, item]));
  const postTradeOwner = (pickId: string) => (
    pickMoves.find((move) => move.id === pickId)?.toTeamCode ?? picksById.get(pickId)?.ownerTeamCode ?? ""
  );
  const automaticClauseRemovals = existingClauseAgreements.flatMap((agreement) => (
    postTradeOwner(agreement.subjectPickId) === postTradeOwner(agreement.counterpartyPickId)
      ? [{
        agreementId: agreement.agreementId,
        subjectOwnerTeamCode: agreement.subjectOwnerTeamCode,
        counterpartyOwnerTeamCode: agreement.counterpartyOwnerTeamCode,
        subjectYear: agreement.subjectYear,
        counterpartyYear: agreement.counterpartyYear,
        subjectRound: agreement.subjectRound,
        counterpartyRound: agreement.counterpartyRound,
        action: "remove" as const,
        clause: null,
      }]
      : []
  ));
  const effectiveExistingClauseChanges = [
    ...existingClauseChanges,
    ...automaticClauseRemovals.filter((automatic) => !existingClauseChanges.some((change) => change.agreementId === automatic.agreementId)),
  ];
  const reservedPickIds = new Set(pickClauses.flatMap((agreement) => (
    [agreement.pickId, ...(agreement.counterpartyPickId ? [agreement.counterpartyPickId] : [])]
  )));
  const removedClausePickIds = new Set(effectiveExistingClauseChanges.flatMap((change) => {
    const agreement = existingClauseAgreements.find((item) => item.agreementId === change.agreementId);
    return agreement ? [agreement.subjectPickId, agreement.counterpartyPickId] : [];
  }));
  const canReuseConditionedPick = (pick: DraftPick) => (
    !pick.hasExistingCondition || removedClausePickIds.has(pick.id)
  );

  const evaluation = useMemo(() => evaluateTrade({
    twoWaySlotLimit,
    phase,
    tradeDeadlinePassed,
    tradesOpen,
    enforceOffseasonCap,
    tradableDraftYears,
    protectionCounterpartyDraftYears,
    teams: participants.map((team) => ({
      code: team.code,
      currentCost: team.currentCost,
      futureCosts: team.futureCosts,
      slots: {
        regular: team.players.filter((player) => player.slot === "regular").length,
        twoWay: team.players.filter((player) => player.slot === "two_way").length,
        gLeague: team.players.filter((player) => player.slot === "g_league").length,
        dpe: team.players.filter((player) => player.slot === "dpe").length,
      },
      roles: countRosterRoles(team.players, includeDpeInRoleMinimums),
    })),
    playerMoves,
    pickMoves: pickMoves.map((move) => ({
      ...move,
      hasExistingCondition: move.hasExistingCondition && !removedClausePickIds.has(move.id),
    })),
    pickClauses: pickClauses.map((agreement) => ({
      ...agreement,
      counterpartyOwnerTeamCode: agreement.counterpartyTeamCode,
      postTradeOwnerTeamCode: postTradeOwner(agreement.pickId),
      counterpartyPostTradeOwnerTeamCode: agreement.counterpartyPickId ? postTradeOwner(agreement.counterpartyPickId) : null,
      hasExistingCondition: Boolean(picksById.get(agreement.pickId)?.pick.hasExistingCondition && !removedClausePickIds.has(agreement.pickId)),
      counterpartyHasExistingCondition: Boolean(agreement.counterpartyPickId && picksById.get(agreement.counterpartyPickId)?.pick.hasExistingCondition && !removedClausePickIds.has(agreement.counterpartyPickId)),
    })),
    existingClauseChanges: effectiveExistingClauseChanges,
    qualifyingOfferMoves,
    qualifyingOfferTransfersOpen,
    enforceRoleMinimums,
    cuts,
    promotions,
    stretches,
  }), [cuts, stretches, effectiveExistingClauseChanges, enforceOffseasonCap, enforceRoleMinimums, includeDpeInRoleMinimums, participants, phase, pickClauses, pickMoves, playerMoves, promotions, protectionCounterpartyDraftYears, qualifyingOfferMoves, qualifyingOfferTransfersOpen, tradableDraftYears, tradeDeadlinePassed, tradesOpen, twoWaySlotLimit]);
  const capWarnings = [...new Set([
    ...evaluation.warnings
      .filter((warning) => warning.code.includes("CAP"))
      .map((warning) => displayIssue(warning.message, teams)),
  ])];
  const roleMinimumRestorations = evaluation.calculated.teamResults.filter((team) => team.requiredRoleFreeAgents > 0);
  const roleMinimumConfirmationRequired = roleMinimumRestorations.length > 0;
  const roleMinimumSlotIssues = roleMinimumRestorations.flatMap((team) => {
    const freeSlots = Math.max(0, 15 - team.slots.regular) + Math.max(0, twoWaySlotLimit - team.slots.twoWay);
    return freeSlots >= team.requiredRoleFreeAgents
      ? []
      : [{ teamCode: team.code, message: `${formatTeamName(teams.find((item) => item.code === team.code)?.name ?? team.code)}: servono ${team.requiredRoleFreeAgents} slot tra roster e Two-way per i free agent obbligatori, ma ne restano ${freeSlots}.` }];
  });
  const roleMinimumSlotErrors = roleMinimumSlotIssues.map((issue) => issue.message);
  const simulatorRoleMinimumSlotError = simulator && roleMinimumSlotErrors.length > 0;
  const signAndTradePlayerTransferred = !signAndTrade || signAndTradeTransfersNewSigning(
    playerMoves,
    signAndTrade.signingEntryId,
    signAndTrade.signerTeamCode,
  );

  useEffect(() => {
    setPickClauses((current) => {
      const next = reconcileTradePickClauses(current, { allPicks, participantCodes, postTradeOwner, canReuseConditionedPick, protectionCounterpartyDraftYears });
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [teams, existingClauseChanges, participantCodes, pickMoves, protectionCounterpartyDraftYears]);

  const simulationValid = evaluation.valid
    && capWarnings.length === 0
    && !simulatorRoleMinimumSlotError
    && signAndTradePlayerTransferred
    && (!roleMinimumConfirmationRequired || roleMinimumConfirmed);
  const readableTradeRecap = simulationValid
    ? tradeSimulationRecap({
      stretches,
      teams,
      participantCodes,
      playerMoves,
      pickMoves,
      pickClauses,
      existingClauseChanges: effectiveExistingClauseChanges,
      qualifyingOfferMoves,
      cuts,
      promotions,
      existingClauseAgreements,
    })
    : "";
  // L'associazione usa il codice originale, non il nome visualizzato (che può essere uguale fra squadre).
  const displayScopedIssue = (issue: { message: string }) => ({
    teamCode: participants.find((team) => issue.message.startsWith(`${team.code}:`))?.code,
    message: displayIssue(issue.message, teams),
  });
  const errorNotices = [
    ...evaluation.errors.map(displayScopedIssue),
    ...(!signAndTradePlayerTransferred ? [{ teamCode: signAndTrade?.signerTeamCode, message: "Il sign and trade deve trasferire il giocatore appena firmato a un’altra squadra." }] : []),
    ...evaluation.warnings.filter((warning) => warning.code.includes("CAP"))
      .map(displayScopedIssue).map((issue) => ({ ...issue, message: `Scambio non valido: ${issue.message}` })),
    ...roleMinimumSlotIssues.map((issue) => ({ ...issue, message: `Scambio non valido: ${issue.message}` })),
  ];
  const warningNotices = evaluation.warnings.filter((warning) => !warning.code.includes("CAP")).map(displayScopedIssue);
  const validationErrors = errorNotices.map((issue) => issue.message);
  const validationWarnings = warningNotices.map((issue) => issue.message);

  function changeParticipant(previousCode: string, nextCode: string) {
    if (previousCode === signAndTrade?.signerTeamCode) return;
    invalidateTradeConfirmations();
    setParticipantCodes((current) => current.map((code) => (
      code === previousCode ? nextCode : code
    )));
    setPlayerMoves((current) => current.filter((move) => (
      move.fromTeamCode !== previousCode && move.toTeamCode !== previousCode
    )));
    setPickMoves((current) => current.filter((move) => (
      move.fromTeamCode !== previousCode && move.toTeamCode !== previousCode
    )));
    setPickClauses((current) => current.filter((clause) => (
      clause.pickOwnerTeamCode !== previousCode
      && clause.beneficiaryTeamCode !== previousCode
      && clause.counterpartyTeamCode !== previousCode
    )));
    setQualifyingOfferMoves((current) => current.filter((move) => (
      move.fromTeamCode !== previousCode && move.toTeamCode !== previousCode
    )));
    const removedPlayerIds = new Set(playerMoves.filter((move) => move.fromTeamCode === previousCode || move.toTeamCode === previousCode).map((move) => move.id));
    setCuts((current) => current.filter((cut) => cut.teamCode !== previousCode && !removedPlayerIds.has(cut.id)));
    setPromotions((current) => current.filter((promotion) => promotion.teamCode !== previousCode));
    setStretches((current) => current.filter((stretch) => stretch.teamCode !== previousCode));
    setExistingClauseChanges([]);
  }

  function removeParticipant(teamCode: string) {
    if (participantCodes.length <= 2 || teamCode === signAndTrade?.signerTeamCode) return;
    invalidateTradeConfirmations();
    setParticipantCodes((current) => current.filter((code) => code !== teamCode));
    setPlayerMoves((current) => current.filter((move) => (
      move.fromTeamCode !== teamCode && move.toTeamCode !== teamCode
    )));
    setPickMoves((current) => current.filter((move) => (
      move.fromTeamCode !== teamCode && move.toTeamCode !== teamCode
    )));
    setPickClauses((current) => current.filter((clause) => (
      clause.pickOwnerTeamCode !== teamCode
      && clause.beneficiaryTeamCode !== teamCode
      && clause.counterpartyTeamCode !== teamCode
    )));
    setQualifyingOfferMoves((current) => current.filter((move) => (
      move.fromTeamCode !== teamCode && move.toTeamCode !== teamCode
    )));
    const removedPlayerIds = new Set(playerMoves.filter((move) => move.fromTeamCode === teamCode || move.toTeamCode === teamCode).map((move) => move.id));
    setCuts((current) => current.filter((cut) => cut.teamCode !== teamCode && !removedPlayerIds.has(cut.id)));
    setPromotions((current) => current.filter((promotion) => promotion.teamCode !== teamCode));
    setStretches((current) => current.filter((stretch) => stretch.teamCode !== teamCode));
    setExistingClauseChanges([]);
  }

  function addParticipant() {
    const nextTeam = teams.find((team) => !participantCodes.includes(team.code));
    if (nextTeam) {
      invalidateTradeConfirmations();
      setParticipantCodes((current) => [...current, nextTeam.code]);
    }
  }

  function invalidateTradeConfirmations() {
    setRoleMinimumConfirmed(false);
  }

  function addPickClause({
    beneficiaryTeamCode,
    pickId,
    clause,
    counterpartyPickId,
  }: {
    beneficiaryTeamCode: string;
    pickId: string;
    clause: Exclude<TradePickClause, "none">;
    counterpartyPickId: string;
  }) {
    const selectedClausePick = picksById.get(pickId)?.pick;
    const selectedClausePickOwner = picksById.get(pickId)?.ownerTeamCode;
    const selectedCounterparty = picksById.get(counterpartyPickId)?.pick;
    const selectedCounterpartyOwner = picksById.get(counterpartyPickId)?.ownerTeamCode;
    if (!selectedClausePick || !selectedClausePickOwner || !selectedCounterparty || !selectedCounterpartyOwner) return;
    invalidateTradeConfirmations();
    setPickClauses((current) => {
      const options = tradeClausePickOptions({ allPicks, participantCodes, postTradeOwner, canReuseConditionedPick, protectionCounterpartyDraftYears,
        teamCode: beneficiaryTeamCode, clause, selectedPickId: pickId,
        reservedPickIds: new Set(current.flatMap((agreement) => [agreement.pickId, ...(agreement.counterpartyPickId ? [agreement.counterpartyPickId] : [])])),
      });
      if (!options.subjects.some(({ pick }) => pick.id === pickId) || !options.counterparties.some(({ pick }) => pick.id === counterpartyPickId)) return current;
      return [...current, {
        id: `${selectedClausePickOwner}:clause:${selectedClausePick.id}`,
        pickId: selectedClausePick.id,
        pickOwnerTeamCode: selectedClausePickOwner,
        beneficiaryTeamCode,
        year: selectedClausePick.year,
        round: selectedClausePick.round,
        hasExistingCondition: selectedClausePick.hasExistingCondition && !removedClausePickIds.has(selectedClausePick.id),
        clause,
        counterpartyPickId: selectedCounterparty.id,
        counterpartyYear: selectedCounterparty.year,
        counterpartyRound: selectedCounterparty.round,
        counterpartyHasExistingCondition: selectedCounterparty.hasExistingCondition && !removedClausePickIds.has(selectedCounterparty.id),
        pickTitle: pickTitle(selectedClausePick),
        pickOwnerName: formatTeamName(teams.find((team) => team.code === selectedClausePickOwner)?.name ?? selectedClausePickOwner),
        counterpartyTitle: pickTitle(selectedCounterparty),
        counterpartyTeamCode: selectedCounterpartyOwner,
        postTradeOwnerTeamCode: postTradeOwner(selectedClausePick.id),
        counterpartyPostTradeOwnerTeamCode: postTradeOwner(selectedCounterparty.id),
      }];
    });
  }

  function setExistingClauseRemoval(agreement: ExistingTradeClauseAgreement, remove: boolean) {
    invalidateTradeConfirmations();
    setExistingClauseChanges((current) => {
      const others = current.filter((item) => item.agreementId !== agreement.agreementId);
      if (!remove) return others;
      return [...others, {
        agreementId: agreement.agreementId,
        subjectOwnerTeamCode: agreement.subjectOwnerTeamCode,
        counterpartyOwnerTeamCode: agreement.counterpartyOwnerTeamCode,
        subjectYear: agreement.subjectYear,
        counterpartyYear: agreement.counterpartyYear,
        subjectRound: agreement.subjectRound,
        counterpartyRound: agreement.counterpartyRound,
        action: "remove",
        clause: null,
      }];
    });
  }

  return (
    <form
      action={simulator ? undefined : registerAction}
      className={`trade-builder${simulator ? " trade-simulator-builder" : ""}`}
      onSubmit={(event) => {
        if (simulator) {
          event.preventDefault();
          return;
        }
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        if (!(submitter instanceof HTMLElement) || submitter.dataset.tradeFinalSubmit !== "true") {
          event.preventDefault();
          if (simulationValid) setConfirmationOpen(true);
        }
      }}
    >
      {!simulator && <input
        type="hidden"
        name="trade_json"
        value={JSON.stringify({
          signAndTrade: signAndTrade?.request ?? null,
          stretches: stretches.map(({ id, teamCode, years, cost, contract }) => ({ id, teamCode, years, cost, contract })),
          participantCodes,
          playerMoves,
          pickMoves,
          pickClauses,
          qualifyingOfferMoves,
          existingClauseChanges: effectiveExistingClauseChanges,
          cuts,
          promotions,
        })}
      />}
      {!simulator && <input type="hidden" name="role_minimum_confirmed" value={String(roleMinimumConfirmed)} />}
      {signAndTrade && (
        <section className="sign-trade-banner">
          <div>
            <span>Sign and trade</span>
            <strong>{signAndTrade.playerName}</strong>
            <small>{signAndTrade.label}</small>
          </div>
          <p>Salary cap e slot vengono verificati sul risultato finale dello scambio.</p>
          <a href="/admin/free-agent">Annulla</a>
        </section>
      )}
      <section className="trade-participants" aria-labelledby="trade-participants-title">
        <div className="trade-participants-heading">
          <h2 id="trade-participants-title">Squadre coinvolte</h2>
          <button className="button secondary" type="button" onClick={addParticipant} disabled={participantCodes.length >= teams.length}>+ Aggiungi squadra</button>
        </div>
        <div className="trade-participant-grid">
          {participants.map((team, index) => (
            <div className="trade-participant-row" key={team.code}>
              <label>
                <span>Squadra {index + 1}</span>
                <select aria-label={`Squadra ${index + 1}`} value={team.code} disabled={team.code === signAndTrade?.signerTeamCode} onChange={(event) => changeParticipant(team.code, event.target.value)}>
                  {teams.map((option) => <option value={option.code} key={option.code} disabled={option.code !== team.code && participantCodes.includes(option.code)}>{formatTeamName(option.name)}</option>)}
                </select>
              </label>
              {participants.length > 2 && team.code !== signAndTrade?.signerTeamCode && <button type="button" onClick={() => removeParticipant(team.code)} aria-label={`Rimuovi ${formatTeamName(team.name)}`}>×</button>}
            </div>
          ))}
        </div>
      </section>

      <div className="trade-team-grid">
        {participants.map((team) => (
          <div className="trade-team-column" key={team.code}>
          <TradeTeamCard
            team={team}
            allTeams={teams}
            participants={participants}
            participantCodes={participantCodes}
            phase={phase}
            qualifyingOfferTransfersOpen={qualifyingOfferTransfersOpen}
            playerMoves={playerMoves}
            pickMoves={pickMoves}
            qualifyingOfferMoves={qualifyingOfferMoves}
            cuts={cuts}
            stretches={stretches}
            promotions={promotions}
            allPicks={allPicks}
            reservedPickIds={reservedPickIds}
            pickClauses={pickClauses}
            existingClauseAgreements={existingClauseAgreements}
            existingClauseChanges={effectiveExistingClauseChanges}
            automaticClauseRemovalIds={new Set(automaticClauseRemovals.map((item) => item.agreementId))}
            protectionCounterpartyDraftYears={protectionCounterpartyDraftYears}
            postTradeOwner={postTradeOwner}
            canReuseConditionedPick={canReuseConditionedPick}
            canRemove={participants.length > 2 && team.code !== signAndTrade?.signerTeamCode}
            onRemove={() => removeParticipant(team.code)}
            onAddPlayer={(move) => { invalidateTradeConfirmations(); setPlayerMoves((current) => [...current, move]); }}
            onRemovePlayer={(id) => { invalidateTradeConfirmations(); setPlayerMoves((current) => current.filter((move) => move.id !== id)); setCuts((current) => current.filter((cut) => cut.id !== id)); }}
            onAddPick={(move) => { invalidateTradeConfirmations(); setPickMoves((current) => [...current, move]); }}
            onRemovePick={(id) => { invalidateTradeConfirmations(); setPickMoves((current) => current.filter((move) => move.id !== id)); }}
            onAddQualifyingOffer={(move) => { invalidateTradeConfirmations(); setQualifyingOfferMoves((current) => [...current, move]); }}
            onRemoveQualifyingOffer={(id) => { invalidateTradeConfirmations(); setQualifyingOfferMoves((current) => current.filter((move) => move.id !== id)); }}
            onAddCut={(cut) => { invalidateTradeConfirmations(); setCuts((current) => [...current, cut]); }}
            onRemoveCut={(id) => { invalidateTradeConfirmations(); setCuts((current) => current.filter((cut) => cut.id !== id)); }}
            onUpdateCut={(id, stretchYears) => { invalidateTradeConfirmations(); setCuts((current) => current.map((cut) => cut.id === id ? { ...cut, stretchYears } : cut)); }}
            onAddStretch={(stretch) => { invalidateTradeConfirmations(); setStretches((current) => [...current, stretch]); }}
            onRemoveStretch={(id) => { invalidateTradeConfirmations(); setStretches((current) => current.filter((stretch) => stretch.id !== id)); }}
            onUpdateStretch={(id, years) => { invalidateTradeConfirmations(); setStretches((current) => current.map((stretch) => stretch.id === id ? { ...stretch, years } : stretch)); }}
            onAddPromotion={(promotion) => {
              invalidateTradeConfirmations();
              if (playerMoves.some((move) => move.id === promotion.id && move.toTeamCode === promotion.teamCode)) {
                // Per un ricevuto lo slot finale è già salvato sul trasferimento: niente doppio conteggio.
                setPlayerMoves((current) => current.map((move) => move.id === promotion.id ? { ...move, destinationSlot: promotion.destinationSlot } : move));
              } else setPromotions((current) => [...current, promotion]);
            }}
            onRemovePromotion={(id) => {
              invalidateTradeConfirmations();
              setPlayerMoves((current) => current.map((move) => move.id === id ? { ...move, destinationSlot: move.sourceSlot } : move));
              setPromotions((current) => current.filter((promotion) => promotion.id !== id));
            }}
            onAddPickClause={addPickClause}
            onRemovePickClause={(id) => { invalidateTradeConfirmations(); setPickClauses((current) => current.filter((clause) => clause.id !== id)); }}
            onToggleExistingClause={setExistingClauseRemoval}
          />
          <TradeTeamSummary team={team} result={evaluation.calculated.teamResults.find((result) => result.code === team.code)} twoWaySlotLimit={twoWaySlotLimit} />
          <TradeValidation title={`Errori e avvisi ${formatTeamName(team.name)}`}
            errors={errorNotices.filter((issue) => issue.teamCode === team.code).map((issue) => issue.message)}
            warnings={warningNotices.filter((issue) => issue.teamCode === team.code).map((issue) => issue.message)} />
          </div>
        ))}
      </div>

      {roleMinimumConfirmationRequired && roleMinimumSlotErrors.length === 0 && (
        <section className="trade-role-restoration" aria-label="Ripristino obbligatorio dei ruoli">
          <strong>Attenzione: dopo lo scambio va assegnato un free agent casuale da 1 credito</strong>
          <p>{roleMinimumRestorations.map((team) => `${formatTeamName(teams.find((item) => item.code === team.code)?.name ?? team.code)}: ${roleMinimumLabel(team.missingRoles)}`).join("; ")}. Il costo è già incluso nello spazio libero mostrato sopra.</p>
          <label>
            <input type="checkbox" checked={roleMinimumConfirmed} onChange={(event) => setRoleMinimumConfirmed(event.target.checked)} />
            Confermo che assegnerò in un passaggio successivo i free agent casuali da 1 credito previsti dal regolamento.
          </label>
        </section>
      )}

      {simulator ? (
        <TradeSimulationStatus valid={simulationValid} recap={readableTradeRecap} errors={validationErrors} warnings={validationWarnings} />
      ) : (
        <>
          <TradeValidation title="Riepilogo errori e avvisi" errors={validationErrors} warnings={validationWarnings} />
          <button
            className="button primary trade-submit"
            type="button"
            disabled={!simulationValid}
            onClick={() => setConfirmationOpen(true)}
          >
            {simulationValid ? "Conferma scambio" : "Operazione non disponibile"}
          </button>
          {confirmationOpen && (
            <div
              className="auction-modal-backdrop trade-confirmation-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setConfirmationOpen(false);
              }}
            >
              <section className="auction-modal trade-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="trade-confirmation-title">
                <header className="auction-modal-header">
                  <div>
                    <span>Riepilogo definitivo</span>
                    <strong id="trade-confirmation-title">Conferma scambio</strong>
                    <small>Controlla il testo prima di registrare il movimento.</small>
                  </div>
                </header>
                <div className="auction-modal-body trade-confirmation-body">
                  <textarea value={readableTradeRecap} readOnly aria-label="Recap dello scambio da confermare" />
                  <label className="trade-confirmation-correction">
                    <input
                      type="checkbox"
                      name="record_as_correction"
                      value="true"
                      checked={recordAsCorrection}
                      onChange={(event) => setRecordAsCorrection(event.target.checked)}
                    />
                    <span>Registra questo movimento come rettifica dell’admin anziché come scambio.</span>
                  </label>
                </div>
                <footer className="auction-modal-actions">
                  <button className="button secondary" type="button" onClick={() => setConfirmationOpen(false)}>Chiudi</button>
                  <button className="button primary" type="submit" data-trade-final-submit="true">Conferma definitivamente</button>
                </footer>
              </section>
            </div>
          )}
        </>
      )}
    </form>
  );
}

function TradeTeamSummary({ team, result, twoWaySlotLimit }: {
  team: TradeTeam;
  result: ReturnType<typeof evaluateTrade>["calculated"]["teamResults"][number] | undefined;
  twoWaySlotLimit: number;
}) {
  if (!result) return null;
  return (
    <article className="trade-summary-card" aria-label={`Riepilogo ${formatTeamName(team.name)}`}>
      <strong>{formatTeamName(team.name)}</strong>
      <div>
        <span>Spazio {team.currentSeasonName}<b>{formatSpace(result.spaceBefore)} → {formatSpace(result.spaceAfter)}</b></span>
        {result.futureCaps.map((future) => <span key={future.seasonName}>Spazio {future.seasonName}<b>{formatSpace(future.spaceBefore)} → {formatSpace(future.spaceAfter)}</b></span>)}
        <span className="trade-summary-roles">Ruoli<b>{result.rolesBefore.G} G · {result.rolesBefore.A} A · {result.rolesBefore.C} C → {result.roles.G} G · {result.roles.A} A · {result.roles.C} C</b></span>
        {result.requiredRoleFreeAgents > 0 && <span className="role-restoration-cap">Ripristino<b>+{result.requiredRoleFreeAgents} FA · {result.requiredRoleFreeAgents} cr</b></span>}
        <span>Roster<b>{result.slotsBefore.regular} / 15 → {result.slots.regular} / 15</b></span>
        <span>Two-way<b>{result.slotsBefore.twoWay} / {twoWaySlotLimit} → {result.slots.twoWay} / {twoWaySlotLimit}</b></span>
        <span>G-League<b>{result.slotsBefore.gLeague} / 3 → {result.slots.gLeague} / 3</b></span>
        <span>DPE<b>{result.slotsBefore.dpe} → {result.slots.dpe}</b></span>
      </div>
      <p className="manual-cut-check">Verifica manualmente che i giocatori acquisiti non compaiano tra i tagliati:<br />{team.cutPlayerNames.length ? team.cutPlayerNames.join(" · ") : "nessun giocatore tagliato"}</p>
    </article>
  );
}

function roleMinimumLabel(missing: { G: number; A: number; C: number }) {
  return [missing.G ? `${missing.G} G` : "", missing.A ? `${missing.A} A` : "", missing.C ? `${missing.C} C` : ""]
    .filter(Boolean)
    .join(" · ");
}

function TradeValidation({ title, errors, warnings }: { title: string; errors: string[]; warnings: string[] }) {
  if (!errors.length && !warnings.length) return null;
  return (
    <section className={`trade-validation ${errors.length ? "has-errors" : "has-warnings"}`} aria-label={title}>
      <strong>{title}</strong>
      {warnings.map((warning, index) => <p className="validation warning" key={`warning-${index}`}>{warning}</p>)}
      {errors.map((error, index) => <p className="validation error" key={`error-${index}`}>{error}</p>)}
    </section>
  );
}

function TradeSimulationStatus({ valid, recap, errors, warnings }: { valid: boolean; recap: string; errors: string[]; warnings: string[] }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function copyRecap() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard non disponibile");
      await navigator.clipboard.writeText(recap);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("error");
    }
  }

  return (
    <section className={`trade-simulation-status ${valid ? "is-valid" : "is-invalid"}`} aria-live="polite">
      <strong>{valid ? "Scambio valido" : "Scambio non ancora valido"}</strong>
      {valid && <span>Tutti i controlli sono superati.</span>}
      {(errors.length > 0 || warnings.length > 0) && (
        <div className="trade-simulation-validation">
          <strong>Riepilogo errori e avvisi</strong>
          {errors.map((error, index) => <p className="validation error" key={`simulation-error-${index}`}>{error}</p>)}
          {warnings.map((warning, index) => <p className="validation warning" key={`simulation-warning-${index}`}>{warning}</p>)}
        </div>
      )}
      {recap && (
        <>
          <label>
            <span>Recap da copiare</span>
            <textarea value={recap} readOnly aria-label="Recap testuale dello scambio simulato" />
          </label>
          <div className="trade-simulation-copy-row">
            <button className="trade-simulation-copy" type="button" onClick={copyRecap}>Copia testo</button>
          </div>
          {copyState === "copied" && <small className="trade-simulation-copy-status">Testo copiato.</small>}
          {copyState === "error" && <small className="trade-simulation-copy-status error">Copia non disponibile: seleziona il testo manualmente.</small>}
        </>
      )}
    </section>
  );
}

function TradeTeamCard({
  team,
  allTeams,
  participants,
  participantCodes,
  phase,
  qualifyingOfferTransfersOpen,
  playerMoves,
  pickMoves,
  qualifyingOfferMoves,
  cuts,
  stretches,
  promotions,
  allPicks,
  reservedPickIds,
  pickClauses,
  existingClauseAgreements,
  existingClauseChanges,
  automaticClauseRemovalIds,
  protectionCounterpartyDraftYears,
  postTradeOwner,
  canReuseConditionedPick,
  canRemove,
  onRemove,
  onAddPlayer,
  onRemovePlayer,
  onAddPick,
  onRemovePick,
  onAddQualifyingOffer,
  onRemoveQualifyingOffer,
  onAddCut,
  onRemoveCut,
  onUpdateCut,
  onAddStretch,
  onRemoveStretch,
  onUpdateStretch,
  onAddPromotion,
  onRemovePromotion,
  onAddPickClause,
  onRemovePickClause,
  onToggleExistingClause,
}: {
  team: TradeTeam;
  allTeams: TradeTeam[];
  participants: TradeTeam[];
  participantCodes: string[];
  phase: string;
  qualifyingOfferTransfersOpen: boolean;
  playerMoves: PlayerMove[];
  pickMoves: PickMove[];
  qualifyingOfferMoves: QualifyingOfferMove[];
  cuts: CutMove[];
  stretches: TradeStretchMove[];
  promotions: PromotionMove[];
  allPicks: { pick: DraftPick; ownerTeamCode: string }[];
  reservedPickIds: Set<string>;
  pickClauses: PickClauseAgreement[];
  existingClauseAgreements: ExistingTradeClauseAgreement[];
  existingClauseChanges: TradeExistingClauseChange[];
  automaticClauseRemovalIds: Set<string>;
  protectionCounterpartyDraftYears: number[];
  postTradeOwner: (pickId: string) => string;
  canReuseConditionedPick: (pick: DraftPick) => boolean;
  canRemove: boolean;
  onRemove: () => void;
  onAddPlayer: (move: PlayerMove) => void;
  onRemovePlayer: (id: string) => void;
  onAddPick: (move: PickMove) => void;
  onRemovePick: (id: string) => void;
  onAddQualifyingOffer: (move: QualifyingOfferMove) => void;
  onRemoveQualifyingOffer: (id: string) => void;
  onAddCut: (cut: CutMove) => void;
  onRemoveCut: (id: string) => void;
  onUpdateCut: (id: string, stretchYears: 2 | 3 | null) => void;
  onAddStretch: (stretch: TradeStretchMove) => void;
  onRemoveStretch: (id: string) => void;
  onUpdateStretch: (id: string, years: 2 | 3) => void;
  onAddPromotion: (promotion: PromotionMove) => void;
  onRemovePromotion: (id: string) => void;
  onAddPickClause: (input: {
    beneficiaryTeamCode: string;
    pickId: string;
    clause: Exclude<TradePickClause, "none">;
    counterpartyPickId: string;
  }) => void;
  onRemovePickClause: (id: string) => void;
  onToggleExistingClause: (agreement: ExistingTradeClauseAgreement, remove: boolean) => void;
}) {
  const [playerId, setPlayerId] = useState("");
  const [pickId, setPickId] = useState("");
  const [qualifyingOfferId, setQualifyingOfferId] = useState("");
  const [cutId, setCutId] = useState("");
  const [stretchId, setStretchId] = useState("");
  const [stretchYears, setStretchYears] = useState<2 | 3>(2);
  // Per i nuovi tagli la stretch rimane sul taglio stesso: rimuovendolo sparisce anche la stretch.
  // Si preservano così payload e controlli atomici già esistenti.
  const stretchContracts = [
    ...team.stretchContracts.map((entry) => ({ ...entry, contextual: false as const, years: stretches.find((stretch) => stretch.id === entry.id)?.years ?? null })),
    ...cuts.filter((cut) => cut.teamCode === team.code && cut.stretchOptions?.length).map((cut) => ({
      id: cut.id, name: cut.name, cost: allTeams.flatMap((candidate) => candidate.players).find((player) => player.id === cut.id)?.cost ?? cut.cost,
      contract: cut.contract, stretchOptions: cut.stretchOptions ?? [], residualCost: cut.stretchResidualCost ?? cut.cost,
      contextual: true as const, years: cut.stretchYears ?? null,
    })),
  ];
  const availableStretchContracts = stretchContracts.filter((entry) => entry.years === null);
  const selectedStretchContract = availableStretchContracts.find((entry) => entry.id === stretchId);
  const selectedStretchYears = selectedStretchContract?.stretchOptions.includes(stretchYears) ? stretchYears : selectedStretchContract?.stretchOptions[0];
  const teamStretches = stretchContracts.flatMap((entry) => entry.years === null ? [] : [{ ...entry, years: entry.years }]);
  useEffect(() => {
    if (stretchId && !selectedStretchContract) setStretchId("");
  }, [stretchId, selectedStretchContract]);
  const [promotionId, setPromotionId] = useState("");
  const [promotionDestinationSlot, setPromotionDestinationSlot] = useState<Exclude<TradeSlot, "dpe">>("regular");

  const unavailableIds = new Set([
    ...playerMoves.map((move) => move.id),
    ...cuts.map((cut) => cut.id),
    ...promotions.map((promotion) => promotion.id),
  ]);
  const otherParticipants = participants.filter((participant) => participant.code !== team.code);
  const availablePlayersByTeam = otherParticipants.map((sourceTeam) => ({
    team: sourceTeam,
    players: sourceTeam.players.filter((player) => !unavailableIds.has(player.id)),
  }));
  const availablePicksByTeam = otherParticipants.map((sourceTeam) => ({
    team: sourceTeam,
    picks: sourceTeam.picks.filter((pick) => (
      pick.tradable && !pickMoves.some((move) => move.id === pick.id)
    )),
  }));
  const availableOwnPlayers = team.players.filter((player) => !unavailableIds.has(player.id));
  const selectedPlayerSource = otherParticipants.find((sourceTeam) => (
    sourceTeam.players.some((player) => player.id === playerId)
  ));
  const selectedPlayer = selectedPlayerSource?.players.find((player) => player.id === playerId);
  const selectedPickSource = otherParticipants.find((sourceTeam) => (
    sourceTeam.picks.some((pick) => pick.id === pickId)
  ));
  const selectedPick = selectedPickSource?.picks.find((pick) => pick.id === pickId);
  const unavailableQualifyingOfferIds = new Set(qualifyingOfferMoves.map((move) => move.id));
  const availableQualifyingOffersByTeam = otherParticipants.map((sourceTeam) => ({
    team: sourceTeam,
    qualifyingOffers: sourceTeam.qualifyingOffers.filter((offer) => (
      !unavailableQualifyingOfferIds.has(offer.id)
    )),
  }));
  const selectedQualifyingOfferSource = otherParticipants.find((sourceTeam) => (
    sourceTeam.qualifyingOffers.some((offer) => offer.id === qualifyingOfferId)
  ));
  const selectedQualifyingOffer = selectedQualifyingOfferSource?.qualifyingOffers.find(
    (offer) => offer.id === qualifyingOfferId,
  );
  const receivedPlayers = playerMoves.filter((move) => move.toTeamCode === team.code);
  const receivedCutCandidates = receivedPlayers.filter((move) => (
    !cuts.some((cut) => cut.id === move.id)
    && move.destinationSlot === move.sourceSlot
    && !promotions.some((promotion) => promotion.id === move.id)
    && otherParticipants.some((participant) => participant.players.some((player) => player.id === move.id && player.cuttable))
  ));
  const selectedCut = availableOwnPlayers.find((player) => player.id === cutId && player.cuttable);
  const selectedReceivedCut = receivedCutCandidates.find((move) => move.id === cutId);
  const availablePromotionPlayers = [
    ...availableOwnPlayers,
    ...receivedPlayers.flatMap((move) => {
      if (move.destinationSlot !== move.sourceSlot || cuts.some((cut) => cut.id === move.id)) return [];
      const source = otherParticipants.flatMap((participant) => participant.players).find((player) => player.id === move.id);
      return source ? [source] : [];
    }),
  ].filter((player) => player.movementDestinations.length > 0);
  const selectedPromotion = availablePromotionPlayers.find((player) => player.id === promotionId);
  const receivedPicks = pickMoves.filter((move) => move.toTeamCode === team.code);
  const receivedQualifyingOffers = qualifyingOfferMoves.filter((move) => move.toTeamCode === team.code);
  const teamCuts = cuts.filter((cut) => cut.teamCode === team.code);
  const teamPromotions: PromotionMove[] = [
    ...promotions.filter((promotion) => promotion.teamCode === team.code),
    ...receivedPlayers.flatMap((move) => move.destinationSlot === move.sourceSlot || move.sourceSlot === "dpe" || move.destinationSlot === "dpe" ? [] : [{
      id: move.id, name: move.name, teamCode: team.code, sourceSlot: move.sourceSlot, destinationSlot: move.destinationSlot,
    }]),
  ];
  const movementDestinations = selectedPromotion?.movementDestinations ?? [];
  const [pickClause, setPickClause] = useState<TradePickClause>("none");
  const [clausePickId, setClausePickId] = useState("");
  const [counterpartyPickId, setCounterpartyPickId] = useState("");
  const { subjects: clauseSubjectOptions, counterparties: clauseCounterpartyOptions } = tradeClausePickOptions({
    allPicks, participantCodes, postTradeOwner, canReuseConditionedPick, protectionCounterpartyDraftYears,
    teamCode: team.code, clause: pickClause, selectedPickId: clausePickId, reservedPickIds,
  });
  const selectedClausePick = clauseSubjectOptions.find(({ pick }) => pick.id === clausePickId)?.pick;
  const selectedCounterparty = clauseCounterpartyOptions.find(({ pick }) => pick.id === counterpartyPickId)?.pick;
  const teamClauseAgreements = pickClauses.filter((agreement) => agreement.beneficiaryTeamCode === team.code);
  const teamExistingClauses = existingClauseAgreements.filter((agreement) => (
    participantCodes.includes(agreement.subjectOwnerTeamCode)
    && participantCodes.includes(agreement.counterpartyOwnerTeamCode)
    && (agreement.clause === "swap" ? postTradeOwner(agreement.counterpartyPickId) : postTradeOwner(agreement.subjectPickId)) === team.code
  ));

  function addPlayer() {
    if (!selectedPlayer || !selectedPlayerSource) return;
    onAddPlayer({
      id: selectedPlayer.id,
      name: selectedPlayer.name,
      contract: selectedPlayer.contract,
      cost: selectedPlayer.cost,
      newSigning: selectedPlayer.newSigning,
      capCost: selectedPlayer.capCost,
      futureCapCosts: selectedPlayer.futureCapCosts,
      stretchOptions: selectedPlayer.stretchOptions,
      role: selectedPlayer.role,
      sourceSlot: selectedPlayer.slot,
      destinationSlot: selectedPlayer.slot,
      allowedDestinationSlots: selectedPlayer.allowedDestinations,
      fromTeamCode: selectedPlayerSource.code,
      toTeamCode: team.code,
    });
    setPlayerId("");
  }

  function addPick() {
    if (!selectedPick || !selectedPickSource) return;
    onAddPick({
      ...selectedPick,
      fromTeamCode: selectedPickSource.code,
      toTeamCode: team.code,
      clause: "none",
      counterpartyPickId: null,
      counterpartyYear: null,
      counterpartyRound: null,
      counterpartyHasExistingCondition: false,
      counterpartyTitle: null,
      counterpartyTeamCode: null,
    });
    setPickId("");
  }

  function addQualifyingOffer() {
    if (!selectedQualifyingOffer || !selectedQualifyingOfferSource || !qualifyingOfferTransfersOpen) return;
    onAddQualifyingOffer({
      id: selectedQualifyingOffer.id,
      playerName: selectedQualifyingOffer.playerName,
      amount: selectedQualifyingOffer.amount,
      fromTeamCode: selectedQualifyingOfferSource.code,
      toTeamCode: team.code,
    });
    setQualifyingOfferId("");
  }

  function addCut() {
    if (!selectedCut && !selectedReceivedCut) return;
    const stretchOptions = selectedCut?.stretchOptions ?? selectedReceivedCut?.stretchOptions ?? [];
    const yearlyCost = selectedCut?.cost ?? selectedReceivedCut!.cost;
    onAddCut({
      id: cutId,
      teamCode: team.code,
      name: selectedCut?.name ?? selectedReceivedCut!.name,
      cost: selectedCut?.capCost ?? selectedReceivedCut!.capCost,
      futureCapCosts: selectedCut?.futureCapCosts ?? selectedReceivedCut!.futureCapCosts,
      stretchOptions,
      stretchResidualCost: yearlyCost * (stretchOptions.length === 1 && stretchOptions[0] === 3 ? 2 : 1),
      contract: selectedCut?.contract ?? selectedReceivedCut!.contract,
      role: selectedCut?.role ?? selectedReceivedCut!.role,
      slot: selectedCut?.slot ?? selectedReceivedCut!.destinationSlot,
    });
    setCutId("");
  }

  function selectPromotion(nextId: string) {
    setPromotionId(nextId);
    const player = availablePromotionPlayers.find((item) => item.id === nextId);
    setPromotionDestinationSlot(player?.movementDestinations[0] ?? "regular");
  }

  function addPromotion() {
    if (!selectedPromotion || !movementDestinations.includes(promotionDestinationSlot)) return;
    onAddPromotion({
      id: selectedPromotion.id,
      teamCode: team.code,
      name: selectedPromotion.name,
      sourceSlot: selectedPromotion.slot as Exclude<TradeSlot, "dpe">,
      destinationSlot: promotionDestinationSlot,
      allowedDestinationSlots: selectedPromotion.movementDestinations,
    });
    setPromotionId("");
    setPromotionDestinationSlot("regular");
  }

  function selectClauseType(nextClause: TradePickClause) {
    setPickClause(nextClause);
    setClausePickId("");
    setCounterpartyPickId("");
  }

  function selectClausePick(nextId: string) {
    setClausePickId(nextId);
    setCounterpartyPickId("");
  }

  function addClause() {
    if (pickClause === "none" || !selectedClausePick || !selectedCounterparty) return;
    onAddPickClause({
      beneficiaryTeamCode: team.code,
      pickId: selectedClausePick.id,
      clause: pickClause,
      counterpartyPickId: selectedCounterparty.id,
    });
    setPickClause("none");
    setClausePickId("");
    setCounterpartyPickId("");
  }

  return (
    <article className="trade-team-card">
      <div className="trade-team-header">
        <strong>{formatTeamName(team.name)}</strong>
        {canRemove && (
          <button type="button" onClick={onRemove} aria-label={`Rimuovi ${formatTeamName(team.name)}`}>×</button>
        )}
      </div>

      <section className="trade-asset-section">
        <span className="trade-section-label">Giocatori ricevuti</span>
        <div className="trade-composer simple">
          <select value={playerId} onChange={(event) => setPlayerId(event.target.value)}>
            <option value="">Seleziona giocatore</option>
            {availablePlayersByTeam.map(({ team: sourceTeam, players }) => (
              <optgroup label={formatTeamName(sourceTeam.name)} key={sourceTeam.code}>
                {players.map((player) => (
                  <option value={player.id} key={player.id}>
                    {playerOptionLabel(player)}{player.newSigning ? " · Nuova firma" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button type="button" onClick={addPlayer} disabled={!selectedPlayer}>Aggiungi</button>
        </div>
        <AssetList
          items={receivedPlayers.map((move) => ({
            id: move.id,
            primary: move.name,
            secondary: `da ${teamName(move.fromTeamCode, allTeams)} · ${slotLabel(move.sourceSlot)} · ${move.cost} · ${move.contract}${move.newSigning ? " · Nuova firma" : ""}`,
          }))}
          empty="Nessun giocatore ricevuto"
          onRemove={onRemovePlayer}
        />
      </section>

      <section className="trade-asset-section">
        <span className="trade-section-label">Scelte ricevute</span>
        <div className="trade-composer simple">
          <select value={pickId} onChange={(event) => setPickId(event.target.value)}>
            <option value="">Seleziona scelta</option>
            {availablePicksByTeam.map(({ team: sourceTeam, picks }) => (
              <optgroup label={formatTeamName(sourceTeam.name)} key={sourceTeam.code}>
                {picks.map((pick) => (
                  <option value={pick.id} key={pick.id}>{pickOptionLabel(pick)}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button type="button" onClick={addPick} disabled={!selectedPick}>Aggiungi</button>
        </div>
        <AssetList
          items={receivedPicks.map((move) => ({
            id: move.id,
            primary: pickTitle(move),
            secondary: [
              `da ${teamName(move.fromTeamCode, allTeams)}`,
              move.label !== "Scelta" ? move.label : null,
            ].filter(Boolean).join(" · "),
          }))}
          empty="Nessuna scelta ricevuta"
          onRemove={onRemovePick}
        />
      </section>

      {qualifyingOfferTransfersOpen && <section className="trade-asset-section">
        <span className="trade-section-label">Qualifying offer ricevute</span>
        <div className="trade-composer cut">
          <select
            value={qualifyingOfferId}
            onChange={(event) => setQualifyingOfferId(event.target.value)}
            disabled={phase !== "offseason"}
          >
            <option value="">
              {phase === "offseason" ? "Seleziona qualifying offer" : "Disponibili soltanto in offseason"}
            </option>
            {availableQualifyingOffersByTeam.map(({ team: sourceTeam, qualifyingOffers }) => (
              <optgroup label={formatTeamName(sourceTeam.name)} key={sourceTeam.code}>
                {qualifyingOffers.map((offer) => (
                  <option value={offer.id} key={offer.id}>
                    {offer.playerName} · {offer.amount}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            onClick={addQualifyingOffer}
            disabled={!selectedQualifyingOffer || phase !== "offseason"}
          >
            Aggiungi
          </button>
        </div>
        <AssetList
          items={receivedQualifyingOffers.map((move) => ({
            id: move.id,
            primary: move.playerName,
            secondary: `Q.O. ${move.amount} · da ${teamName(move.fromTeamCode, allTeams)}`,
          }))}
          empty="Nessuna qualifying offer ricevuta"
          onRemove={onRemoveQualifyingOffer}
        />
      </section>}

      <section className="trade-asset-section cut">
        <span className="trade-section-label">Tagli contestuali</span>
        <div className="trade-composer cut">
          <select value={cutId} onChange={(event) => setCutId(event.target.value)}>
            <option value="">Seleziona giocatore</option>
            {availableOwnPlayers.filter((player) => player.cuttable).map((player) => (
              <option value={player.id} key={player.id}>
                {playerOptionLabel(player)}
              </option>
            ))}
            {receivedCutCandidates.map((move) => (
              <option value={move.id} key={move.id}>
                {move.name} · ricevuto · {slotLabel(move.destinationSlot)}
              </option>
            ))}
          </select>
          <button type="button" onClick={addCut} disabled={!selectedCut && !selectedReceivedCut}>Taglia</button>
        </div>
        {teamCuts.length ? (
          <div className="trade-asset-list trade-cut-list">
            {teamCuts.map((cut) => (
                <div className="trade-cut-entry" key={cut.id}>
                  <p><span><strong>{cut.name}</strong><small>libera {slotLabel(cut.slot)} · resta a cap</small></span><button type="button" onClick={() => onRemoveCut(cut.id)} aria-label={`Rimuovi ${cut.name}`}>×</button></p>
                </div>
            ))}
          </div>
        ) : <small className="trade-empty">Nessun taglio</small>}
      </section>

      {stretchContracts.length > 0 && <section className="trade-asset-section cut">
        <span className="trade-section-label">Stretch contestuali</span>
        <div className="trade-composer promotion">
          <select aria-label="Contratto tagliato da distribuire" value={selectedStretchContract?.id ?? ""} onChange={(event) => { setStretchId(event.target.value); setStretchYears(2); }}>
            <option value="">Seleziona contratto tagliato</option>
            {availableStretchContracts.map((entry) => <option value={entry.id} key={entry.id}>{entry.name} · {entry.cost} crediti · {entry.contract}{entry.contextual ? " · taglio contestuale" : ""}</option>)}
          </select>
          <select aria-label="Rate stretch del contratto tagliato" value={selectedStretchYears ?? 2} disabled={!selectedStretchContract} onChange={(event) => setStretchYears(Number(event.target.value) as 2 | 3)}>
            {(selectedStretchContract?.stretchOptions ?? [2, 3]).map((years) => <option value={years} key={years}>{years} anni</option>)}
          </select>
          <button type="button" disabled={!selectedStretchContract || !selectedStretchYears} onClick={() => {
            if (!selectedStretchContract || !selectedStretchYears) return;
            if (selectedStretchContract.contextual) onUpdateCut(selectedStretchContract.id, selectedStretchYears);
            else {
              const { contextual: _contextual, years: _years, ...contract } = selectedStretchContract;
              onAddStretch({ ...contract, years: selectedStretchYears });
            }
            setStretchId(""); setStretchYears(2);
          }}>Aggiungi</button>
        </div>
        {teamStretches.map((stretch) => <div className="trade-cut-entry" key={stretch.id}>
          <p><span><strong>{stretch.name}</strong><small>{stretch.contextual ? "tagliato nello scambio" : "già tagliato"} · {stretch.cost} crediti · {stretch.contract}</small></span><button type="button" onClick={() => stretch.contextual ? onUpdateCut(stretch.id, null) : onRemoveStretch(stretch.id)} aria-label={`Rimuovi stretch di ${stretch.name}`}>×</button></p>
          <div className="trade-cut-stretch trade-existing-stretch"><label>Rate<select aria-label={`Rate stretch di ${stretch.name}`} value={stretch.years} onChange={(event) => stretch.contextual ? onUpdateCut(stretch.id, Number(event.target.value) as 2 | 3) : onUpdateStretch(stretch.id, Number(event.target.value) as 2 | 3)}>{stretch.stretchOptions.map((years) => <option value={years} key={years}>{years} anni</option>)}</select></label><small>{Math.ceil(stretch.residualCost / stretch.years)} crediti/anno</small></div>
        </div>)}
      </section>}

      <section className="trade-asset-section cut">
        <span className="trade-section-label">Spostamenti contestuali</span>
        <div className="trade-composer promotion">
          <select value={selectedPromotion?.id ?? ""} onChange={(event) => selectPromotion(event.target.value)}>
            <option value="">Seleziona giocatore</option>
            {availablePromotionPlayers.map((player) => (
              <option value={player.id} key={player.id}>
                {playerOptionLabel(player)}
              </option>
            ))}
          </select>
          <select
            value={promotionDestinationSlot}
            onChange={(event) => setPromotionDestinationSlot(event.target.value as Exclude<TradeSlot, "dpe">)}
            disabled={!selectedPromotion}
            aria-label="Destinazione dello spostamento"
          >
            {movementDestinations.map((slot) => <option value={slot} key={slot}>{slotLabel(slot)}</option>)}
          </select>
          <button type="button" onClick={addPromotion} disabled={!selectedPromotion}>Sposta</button>
        </div>
        <AssetList
          items={teamPromotions.map((promotion) => ({
            id: promotion.id,
            primary: promotion.name,
            secondary: `${slotLabel(promotion.sourceSlot)} → ${slotLabel(promotion.destinationSlot)}`,
          }))}
          empty="Nessuno spostamento"
          onRemove={onRemovePromotion}
        />
      </section>

      <section className="trade-asset-section trade-clause-section">
        <span className="trade-section-label">Clausole inserite</span>
        <div className="trade-composer clause">
          <select value={pickClause} onChange={(event) => selectClauseType(event.target.value as TradePickClause)} aria-label="Tipo di clausola">
            <option value="none">Seleziona clausola</option>
            <option value="swap">Diritto di swap</option>
            {Array.from({ length: 13 }, (_, index) => index + 1).map((position) => (
              <option value={`protected_top_${position}`} key={position}>Protetta top {position}</option>
            ))}
          </select>
          <select
            value={clausePickId}
            onChange={(event) => selectClausePick(event.target.value)}
            disabled={pickClause === "none"}
            aria-label="Scelta su cui applicare la clausola"
          >
            <option value="">Seleziona scelta</option>
            {participants.map((ownerTeam) => {
              const picks = clauseSubjectOptions.filter(({ pick }) => postTradeOwner(pick.id) === ownerTeam.code);
              return picks.length ? <optgroup label={formatTeamName(ownerTeam.name)} key={ownerTeam.code}>
                {picks.map(({ pick }) => <option value={pick.id} key={pick.id}>{pickOptionLabel(pick)}</option>)}
              </optgroup> : null;
            })}
          </select>
          <div className="trade-clause-action">
            <select
              value={counterpartyPickId}
              onChange={(event) => setCounterpartyPickId(event.target.value)}
              disabled={!selectedClausePick}
              aria-label="Scelta di contropartita"
            >
              <option value="">Seleziona contropartita</option>
              {participants.map((ownerTeam) => {
                const picks = clauseCounterpartyOptions
                  .filter(({ pick }) => postTradeOwner(pick.id) === ownerTeam.code)
                  .map(({ pick }) => pick);
                if (!picks.length) return null;
                return (
                  <optgroup label={formatTeamName(ownerTeam.name)} key={ownerTeam.code}>
                    {picks.map((pick) => <option value={pick.id} key={pick.id}>{pickOptionLabel(pick)}</option>)}
                  </optgroup>
                );
              })}
            </select>
            <button type="button" onClick={addClause} disabled={!selectedClausePick || !selectedCounterparty || pickClause === "none"}>Aggiungi</button>
          </div>
        </div>
        <AssetList
          items={teamClauseAgreements.map((agreement) => ({
            id: agreement.id,
            primary: `${agreement.pickTitle} (${teamName(postTradeOwner(agreement.pickId), allTeams)})`,
            secondary: pickClauseAgreementLabel(agreement, allTeams),
          }))}
          empty="Nessuna clausola inserita"
          onRemove={onRemovePickClause}
        />

        <div className="trade-existing-clauses">
          <span className="trade-section-label">Clausole rimuovibili</span>
          {teamExistingClauses.map((agreement) => {
            const change = existingClauseChanges.find((item) => item.agreementId === agreement.agreementId);
            const removedAutomatically = automaticClauseRemovalIds.has(agreement.agreementId);
              return (
                <label className="trade-existing-clause-row" key={agreement.agreementId}>
                <span>{agreement.label}{removedAutomatically ? " · Rimossa automaticamente" : ""}</span>
                <input
                  type="checkbox"
                  checked={Boolean(change)}
                  disabled={removedAutomatically}
                  aria-label={`Rimuovi ${agreement.label}`}
                  onChange={(event) => onToggleExistingClause(agreement, event.target.checked)}
                />
              </label>
            );
          })}
          {!teamExistingClauses.length && <small className="trade-empty">Nessuna clausola rimuovibile</small>}
        </div>
      </section>

    </article>
  );
}

function AssetList({
  items,
  empty,
  onRemove,
}: {
  items: { id: string; primary: string; secondary: string }[];
  empty: string;
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return <small className="trade-empty">{empty}</small>;
  return (
    <div className="trade-asset-list">
      {items.map((item) => (
        <p key={item.id}>
          <span><strong>{item.primary}</strong><small>{item.secondary}</small></span>
          <button type="button" onClick={() => onRemove(item.id)} aria-label={`Rimuovi ${item.primary}`}>×</button>
        </p>
      ))}
    </div>
  );
}

function formatTeamName(name: string) {
  return name
    .toLocaleLowerCase("it-IT")
    .replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("it-IT"));
}

function teamName(code: string, teams: TradeTeam[]) {
  return formatTeamName(teams.find((team) => team.code === code)?.name ?? code);
}

function slotLabel(slot: TradeSlot) {
  if (slot === "two_way") return "Two-way";
  if (slot === "g_league") return "G-League";
  if (slot === "dpe") return "DPE";
  return "Roster";
}

function playerOptionLabel(player: Pick<RosterPlayer, "name" | "cost" | "slot" | "contract" | "role">) {
  return `${player.name} · ${player.cost} · ${slotLabel(player.slot)} · ${player.contract} · ${player.role ?? "X"}`;
}

export function tradeSimulationRecap({
  stretches = [],
  teams,
  participantCodes,
  playerMoves,
  pickMoves,
  pickClauses,
  existingClauseChanges,
  qualifyingOfferMoves,
  cuts,
  promotions,
  existingClauseAgreements,
}: {
  teams: TradeTeam[];
  participantCodes: string[];
  playerMoves: PlayerMove[];
  pickMoves: PickMove[];
  pickClauses: PickClauseAgreement[];
  existingClauseChanges: TradeExistingClauseChange[];
  qualifyingOfferMoves: QualifyingOfferMove[];
  cuts: CutMove[];
  promotions: PromotionMove[];
  existingClauseAgreements: ExistingTradeClauseAgreement[];
  stretches?: TradeStretchMove[];
}) {
  const lines: string[] = [];
  const movedPickIds = new Set(pickMoves.map((move) => move.id));
  const describeStretch = (name: string, years: number, total: number) => {
    const installment = Math.ceil(total / years);
    return `${name}: ${years} rate da ${installment} ${installment === 1 ? "credito" : "crediti"}`;
  };

  participantCodes.forEach((teamCode) => {
    const outgoing = [
      ...playerMoves
        .filter((move) => move.fromTeamCode === teamCode)
        .map((move) => move.name),
      ...pickMoves
        .filter((move) => move.fromTeamCode === teamCode)
        .map((move) => `Scelta ${pickTitle(move)}`),
      ...qualifyingOfferMoves
        .filter((move) => move.fromTeamCode === teamCode)
        .map((move) => `Q.O. ${move.playerName} (${move.amount} crediti)`),
    ];
    const incoming = [
      ...playerMoves
        .filter((move) => move.toTeamCode === teamCode)
        .map((move) => move.name),
      ...pickMoves
        .filter((move) => move.toTeamCode === teamCode)
        .map((move) => `Scelta ${pickTitle(move)}`),
      ...qualifyingOfferMoves
        .filter((move) => move.toTeamCode === teamCode)
        .map((move) => `Q.O. ${move.playerName} (${move.amount} crediti)`),
    ];
    const clauses = [
      ...pickClauses.flatMap((clause) => {
        const subjectMoved = movedPickIds.has(clause.pickId);
        const subjectNote = `${subjectMoved ? "scelta ceduta" : "scelta"} ${clause.pickTitle}`;
        const subjectOwner = pickMoves.find((move) => move.id === clause.pickId)?.toTeamCode ?? clause.pickOwnerTeamCode;
        const counterpartOwner = pickMoves.find((move) => move.id === clause.counterpartyPickId)?.toTeamCode ?? clause.counterpartyTeamCode;
        if (subjectOwner === teamCode) {
          return [`Clausola inserita sulla ${subjectNote}: ${pickClauseAgreementLabel({ ...clause, counterpartyPostTradeOwnerTeamCode: counterpartOwner }, teams)}`];
        }
        if (counterpartOwner === teamCode && clause.counterpartyTitle) {
          return [clause.clause === "swap"
            ? `Controparte dello swap: ${clause.counterpartyTitle}, collegata alla ${subjectNote} (${teamName(subjectOwner, teams)})`
            : `Protezione top ${clause.clause.replace("protected_top_", "")} sulla ${subjectNote} (${teamName(subjectOwner, teams)}); contropartita: ${clause.counterpartyTitle}`];
        }
        return [];
      }),
    ];
    const removedClauses = existingClauseChanges.flatMap((change) => {
      const agreement = existingClauseAgreements.find((item) => item.agreementId === change.agreementId);
      if (!agreement || (agreement.subjectOwnerTeamCode !== teamCode && agreement.counterpartyOwnerTeamCode !== teamCode)) return [];
      return [agreement.label];
    });

    if (lines.length) lines.push("");
    lines.push(teamName(teamCode, teams).toUpperCase());
    lines.push(`Cede: ${outgoing.length ? outgoing.join("; ") : "—"}`);
    lines.push(`Riceve: ${incoming.length ? incoming.join("; ") : "—"}`);
    const teamCuts = cuts.filter((cut) => cut.teamCode === teamCode);
    const teamMovements = [
      ...promotions.filter((move) => move.teamCode === teamCode),
      ...playerMoves.filter((move) => move.toTeamCode === teamCode && move.sourceSlot !== move.destinationSlot),
    ].map((move) => `${move.name}: ${slotLabel(move.sourceSlot)} → ${slotLabel(move.destinationSlot)}`);
    const teamStretches = [
      ...stretches.filter((stretch) => stretch.teamCode === teamCode)
        .map((stretch) => describeStretch(stretch.name, stretch.years, stretch.residualCost)),
      ...teamCuts.flatMap((cut) => cut.stretchYears ? [describeStretch(cut.name, cut.stretchYears, cut.stretchResidualCost ?? cut.cost)] : []),
    ];
    if (teamCuts.length) lines.push(`Tagli contestuali: ${teamCuts.map((cut) => cut.name).join("; ")}`);
    if (teamMovements.length) lines.push(`Spostamenti contestuali: ${teamMovements.join("; ")}`);
    if (teamStretches.length) lines.push(`Stretch contestuali: ${teamStretches.join("; ")}`);
    if (clauses.length) lines.push(`Clausole inserite: ${clauses.join("; ")}`);
    if (removedClauses.length) lines.push(`Clausole rimosse: ${removedClauses.join("; ")}`);
  });
  return lines.join("\n");
}

function pickTitle(pick: Pick<PickMove, "year" | "round" | "originOrOverall">) {
  return `${pick.year} · ${pick.round} · ${pick.originOrOverall}`;
}

function pickOptionLabel(pick: DraftPick) {
  return `${pickTitle(pick)}${pick.label !== "Scelta" ? ` · ${pick.label}` : ""}${!pick.tradable ? " · non scambiabile" : ""}`;
}

function pickClauseAgreementLabel(agreement: PickClauseAgreement, teams: TradeTeam[]) {
  if (agreement.clause === "none") return "";
  const counterpartyOwner = agreement.counterpartyPostTradeOwnerTeamCode ?? agreement.counterpartyTeamCode;
  const counterparty = agreement.counterpartyTitle && counterpartyOwner
    ? `${agreement.counterpartyTitle} (${teamName(counterpartyOwner, teams)})`
    : null;
  if (agreement.clause === "swap") return `Diritto di swap con ${counterparty ?? "—"}`;
  const protectedThrough = agreement.clause.replace("protected_top_", "");
  return counterparty
    ? `Protetta top ${protectedThrough}; contropartita: ${counterparty}`
    : `Protetta top ${protectedThrough}`;
}

function formatSpace(value: number) {
  return String(value);
}

function displayIssue(message: string, teams: TradeTeam[]) {
  const team = teams.find((item) => message.startsWith(`${item.code}:`));
  return team ? message.replace(`${team.code}:`, `${formatTeamName(team.name)}:`) : message;
}
