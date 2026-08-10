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
import { CapForceControl } from "@/app/admin/cap-force-control";
import type { ExistingTradeClauseAgreement } from "@/lib/trade-state";
import type { SignAndTradeRequest } from "@/lib/sign-and-trade";

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
  promotionDestinations: Exclude<TradeSlot, "dpe">[];
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
  code: string;
  name: string;
  currentSeasonName: string;
  currentCost: number;
  futureCosts: { seasonName: string; currentCost: number }[];
  cutPlayerNames: string[];
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
  tradableDraftYears: number[];
  protectionCounterpartyDraftYears: number[];
  existingClauseAgreements: ExistingTradeClauseAgreement[];
  signAndTrade: null | {
    request: SignAndTradeRequest;
    signerTeamCode: string;
    playerName: string;
    signingEntryId: string;
    label: string;
    capWarnings: string[];
    warnings: string[];
    spaceBefore: number;
    spaceAfterSigning: number;
  };
  teams: TradeTeam[];
  mode?: "admin" | "simulator";
  registerAction?: (formData: FormData) => void | Promise<void>;
}) {
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
  const [promotions, setPromotions] = useState<PromotionMove[]>([]);
  const [existingClauseChanges, setExistingClauseChanges] = useState<TradeExistingClauseChange[]>([]);
  const [forceCap, setForceCap] = useState(false);
  const [roleMinimumConfirmed, setRoleMinimumConfirmed] = useState(false);
  const [roleMinimumSlotConfirmed, setRoleMinimumSlotConfirmed] = useState(false);

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
        subjectRound: agreement.round,
        counterpartyRound: agreement.round,
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
      roles: countRosterRoles(team.players),
    })),
    playerMoves,
    pickMoves: pickMoves.map((move) => ({
      ...move,
      hasExistingCondition: move.hasExistingCondition && !removedClausePickIds.has(move.id),
    })),
    pickClauses: pickClauses.map((agreement) => ({
      ...agreement,
      counterpartyOwnerTeamCode: agreement.counterpartyTeamCode,
    })),
    existingClauseChanges: effectiveExistingClauseChanges,
    qualifyingOfferMoves,
    qualifyingOfferTransfersOpen,
    cuts,
    promotions,
  }), [cuts, effectiveExistingClauseChanges, enforceOffseasonCap, participants, phase, pickClauses, pickMoves, playerMoves, promotions, protectionCounterpartyDraftYears, qualifyingOfferMoves, qualifyingOfferTransfersOpen, tradableDraftYears, tradeDeadlinePassed, tradesOpen]);
  const capWarnings = [...new Set([
    ...(signAndTrade?.capWarnings ?? []),
    ...evaluation.warnings
      .filter((warning) => warning.code.includes("CAP"))
      .map((warning) => displayIssue(warning.message, teams)),
  ])];
  const roleMinimumRestorations = evaluation.calculated.teamResults.filter((team) => team.requiredRoleFreeAgents > 0);
  const roleMinimumConfirmationRequired = roleMinimumRestorations.length > 0;

  useEffect(() => {
    setPickClauses((current) => {
      const next = current.filter((agreement) => {
        const subject = picksById.get(agreement.pickId)?.pick;
        const counterpart = agreement.counterpartyPickId ? picksById.get(agreement.counterpartyPickId)?.pick : undefined;
        if (!subject || !counterpart || !participants.some((team) => team.code === postTradeOwner(subject.id)) || !participants.some((team) => team.code === postTradeOwner(counterpart.id))) return false;
        if (!canReuseConditionedPick(subject) || !canReuseConditionedPick(counterpart)) return false;
        if (agreement.clause === "swap") {
          return postTradeOwner(subject.id) !== postTradeOwner(counterpart.id)
            && subject.year === counterpart.year
            && subject.round === counterpart.round;
        }
        const subjectMove = pickMoves.find((move) => move.id === subject.id);
        return subjectMove !== undefined
          && postTradeOwner(counterpart.id) === subjectMove.fromTeamCode
          && isLaterDraftPick(counterpart.year, counterpart.round, subject.year, subject.round);
      });
      return next.length === current.length ? current : next;
    });
  }, [existingClauseChanges, participantCodes, pickMoves]);

  const simulationValid = evaluation.valid && (capWarnings.length === 0 || forceCap);
  const simulationRecap = simulator && simulationValid
    ? tradeSimulationRecap({
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
    setCuts((current) => current.filter((cut) => cut.teamCode !== previousCode));
    setPromotions((current) => current.filter((promotion) => promotion.teamCode !== previousCode));
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
    setCuts((current) => current.filter((cut) => cut.teamCode !== teamCode));
    setPromotions((current) => current.filter((promotion) => promotion.teamCode !== teamCode));
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
    setForceCap(false);
    setRoleMinimumConfirmed(false);
    setRoleMinimumSlotConfirmed(false);
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
    setPickClauses((current) => [...current, {
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
      subjectWasTraded: pickMoves.some((move) => move.id === selectedClausePick.id),
      subjectTradeFromTeamCode: pickMoves.find((move) => move.id === selectedClausePick.id)?.fromTeamCode ?? null,
    }]);
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
        subjectRound: agreement.round,
        counterpartyRound: agreement.round,
        action: "remove",
        clause: null,
      }];
    });
  }

  return (
    <form
      action={simulator ? undefined : registerAction}
      className={`trade-builder${simulator ? " trade-simulator-builder" : ""}`}
      onSubmit={simulator ? (event) => event.preventDefault() : undefined}
    >
      {!simulator && <input
        type="hidden"
        name="trade_json"
        value={JSON.stringify({
          signAndTrade: signAndTrade?.request ?? null,
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
      {!simulator && <input type="hidden" name="force_cap" value={String(forceCap)} />}
      {!simulator && <input type="hidden" name="role_minimum_confirmed" value={String(roleMinimumConfirmed)} />}
      {!simulator && <input type="hidden" name="role_minimum_slot_confirmed" value={String(roleMinimumSlotConfirmed)} />}
      {signAndTrade && (
        <section className="sign-trade-banner">
          <div>
            <span>Sign and trade</span>
            <strong>{signAndTrade.playerName}</strong>
            <small>{signAndTrade.label}</small>
          </div>
          <div>
            <span>Spazio alla firma</span>
            <strong>{formatSpace(signAndTrade.spaceBefore)} → {formatSpace(signAndTrade.spaceAfterSigning)}</strong>
            <small>Lo slot deve risultare regolare al termine dello scambio.</small>
          </div>
          <a href="/admin/free-agent">Annulla</a>
        </section>
      )}
      <div className="trade-toolbar">
        <button
          className="button secondary"
          type="button"
          onClick={addParticipant}
          disabled={participantCodes.length === teams.length}
        >
          + Aggiungi squadra
        </button>
      </div>

      <div className="trade-team-grid">
        {participants.map((team) => (
          <TradeTeamCard
            key={team.code}
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
            locked={team.code === signAndTrade?.signerTeamCode}
            onTeamChange={(nextCode) => changeParticipant(team.code, nextCode)}
            onRemove={() => removeParticipant(team.code)}
            onAddPlayer={(move) => { invalidateTradeConfirmations(); setPlayerMoves((current) => [...current, move]); }}
            onRemovePlayer={(id) => { invalidateTradeConfirmations(); setPlayerMoves((current) => current.filter((move) => move.id !== id)); }}
            onAddPick={(move) => { invalidateTradeConfirmations(); setPickMoves((current) => [...current, move]); }}
            onRemovePick={(id) => { invalidateTradeConfirmations(); setPickMoves((current) => current.filter((move) => move.id !== id)); }}
            onAddQualifyingOffer={(move) => { invalidateTradeConfirmations(); setQualifyingOfferMoves((current) => [...current, move]); }}
            onRemoveQualifyingOffer={(id) => { invalidateTradeConfirmations(); setQualifyingOfferMoves((current) => current.filter((move) => move.id !== id)); }}
            onAddCut={(cut) => { invalidateTradeConfirmations(); setCuts((current) => [...current, cut]); }}
            onRemoveCut={(id) => { invalidateTradeConfirmations(); setCuts((current) => current.filter((cut) => cut.id !== id)); }}
            onAddPromotion={(promotion) => { invalidateTradeConfirmations(); setPromotions((current) => [...current, promotion]); }}
            onRemovePromotion={(id) => { invalidateTradeConfirmations(); setPromotions((current) => current.filter((promotion) => promotion.id !== id)); }}
            onAddPickClause={addPickClause}
            onRemovePickClause={(id) => { invalidateTradeConfirmations(); setPickClauses((current) => current.filter((clause) => clause.id !== id)); }}
            onToggleExistingClause={setExistingClauseRemoval}
          />
        ))}
      </div>

      <div className="trade-summary-grid">
        {evaluation.calculated.teamResults.map((result) => {
          const team = teams.find((item) => item.code === result.code);
          return (
            <article className="trade-summary-card" key={result.code}>
              <strong>{formatTeamName(team?.name ?? result.code)}</strong>
              <div>
                <span>
                  Spazio {team?.currentSeasonName ?? "attuale"}
                  <b>{formatSpace(result.spaceBefore)} → {formatSpace(result.spaceAfter)}</b>
                </span>
                {result.futureCaps.map((future) => (
                  <span key={future.seasonName}>
                    Spazio {future.seasonName}
                    <b>{formatSpace(future.spaceBefore)} → {formatSpace(future.spaceAfter)}</b>
                  </span>
                ))}
                <span>Ruoli<b>{result.roles.G} G · {result.roles.A} A · {result.roles.C} C</b></span>
                {result.requiredRoleFreeAgents > 0 && <span className="role-restoration-cap">Ripristino<b>+{result.requiredRoleFreeAgents} FA · {result.requiredRoleFreeAgents} cr</b></span>}
                <span>Roster<b>{result.slots.regular} / 15</b></span>
                <span>Two-way<b>{result.slots.twoWay} / 2</b></span>
                <span>G-League<b>{result.slots.gLeague} / 3</b></span>
                <span>DPE<b>{result.slots.dpe} / 1</b></span>
              </div>
              <p className="manual-cut-check">Verifica manualmente che i giocatori acquisiti non compaiano tra i tagliati:<br />{team?.cutPlayerNames.length ? team.cutPlayerNames.join(" · ") : "nessun giocatore tagliato"}</p>
            </article>
          );
        })}
      </div>

      <div className="trade-validation">
        {signAndTrade?.warnings.map((warning) => (
          <p className="validation warning" key={warning}>{warning}</p>
        ))}
        {evaluation.errors.map((error, index) => (
          <p className="validation error" key={`${error.code}-${index}`}>
            {displayIssue(error.message, teams)}
          </p>
        ))}
        {evaluation.warnings.map((warning, index) => (
          <p className="validation warning" key={`${warning.code}-${index}`}>
            {displayIssue(warning.message, teams)}
          </p>
        ))}
      </div>

      <CapForceControl warnings={capWarnings} checked={forceCap} onChange={setForceCap} />

      {!simulator && roleMinimumConfirmationRequired && (
        <section className="trade-role-restoration" aria-label="Ripristino obbligatorio dei ruoli">
          <strong>Attenzione: dopo lo scambio va assegnato un free agent casuale da 1 credito</strong>
          <p>{roleMinimumRestorations.map((team) => `${formatTeamName(teams.find((item) => item.code === team.code)?.name ?? team.code)}: ${roleMinimumLabel(team.missingRoles)}`).join("; ")}. Il costo è già incluso nello spazio libero mostrato sopra.</p>
          <label>
            <input type="checkbox" checked={roleMinimumConfirmed} onChange={(event) => setRoleMinimumConfirmed(event.target.checked)} />
            Confermo che assegnerò il free agent previsto dal regolamento in un passaggio successivo.
          </label>
          <label>
            <input type="checkbox" checked={roleMinimumSlotConfirmed} onChange={(event) => setRoleMinimumSlotConfirmed(event.target.checked)} />
            Confermo che verificherò e, se necessario, libererò lo slot necessario per la firma.
          </label>
        </section>
      )}

      {simulator ? (
        <TradeSimulationStatus valid={simulationValid} recap={simulationRecap} />
      ) : (
        <button
          className="button primary trade-submit"
          type="submit"
          disabled={!evaluation.valid || (capWarnings.length > 0 && !forceCap) || (roleMinimumConfirmationRequired && (!roleMinimumConfirmed || !roleMinimumSlotConfirmed))}
        >
          {evaluation.valid ? "Registra scambio" : "Operazione non disponibile"}
        </button>
      )}
    </form>
  );
}

function roleMinimumLabel(missing: { G: number; A: number; C: number }) {
  return [missing.G ? `${missing.G} G` : "", missing.A ? `${missing.A} A` : "", missing.C ? `${missing.C} C` : ""]
    .filter(Boolean)
    .join(" · ");
}

function TradeSimulationStatus({ valid, recap }: { valid: boolean; recap: string }) {
  return (
    <aside className={`trade-simulation-status ${valid ? "is-valid" : "is-invalid"}`} role="status" aria-live="polite">
      <strong>{valid ? "Scambio valido" : "Scambio non ancora valido"}</strong>
      <span>{valid ? "Tutti i controlli sono superati." : "Completa o correggi la proposta seguendo gli avvisi qui sopra."}</span>
      {recap && (
        <label>
          <span>Recap da copiare</span>
          <textarea value={recap} readOnly aria-label="Recap testuale dello scambio simulato" />
        </label>
      )}
    </aside>
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
  locked,
  onTeamChange,
  onRemove,
  onAddPlayer,
  onRemovePlayer,
  onAddPick,
  onRemovePick,
  onAddQualifyingOffer,
  onRemoveQualifyingOffer,
  onAddCut,
  onRemoveCut,
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
  locked: boolean;
  onTeamChange: (teamCode: string) => void;
  onRemove: () => void;
  onAddPlayer: (move: PlayerMove) => void;
  onRemovePlayer: (id: string) => void;
  onAddPick: (move: PickMove) => void;
  onRemovePick: (id: string) => void;
  onAddQualifyingOffer: (move: QualifyingOfferMove) => void;
  onRemoveQualifyingOffer: (id: string) => void;
  onAddCut: (cut: CutMove) => void;
  onRemoveCut: (id: string) => void;
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
  const [destinationSlot, setDestinationSlot] = useState<TradeSlot>("regular");
  const [pickId, setPickId] = useState("");
  const [qualifyingOfferId, setQualifyingOfferId] = useState("");
  const [cutId, setCutId] = useState("");
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
  const selectedCut = team.players.find((player) => player.id === cutId);
  const selectedPromotion = team.players.find((player) => player.id === promotionId);
  const allowedDestinations = selectedPlayer
    ? selectedPlayer.allowedDestinations
    : ["regular" as TradeSlot];
  const receivedPlayers = playerMoves.filter((move) => move.toTeamCode === team.code);
  const receivedPicks = pickMoves.filter((move) => move.toTeamCode === team.code);
  const receivedQualifyingOffers = qualifyingOfferMoves.filter((move) => move.toTeamCode === team.code);
  const teamCuts = cuts.filter((cut) => cut.teamCode === team.code);
  const teamPromotions = promotions.filter((promotion) => promotion.teamCode === team.code);
  const promotionDestinations = selectedPromotion?.promotionDestinations ?? [];
  const [pickClause, setPickClause] = useState<TradePickClause>("none");
  const [clausePickId, setClausePickId] = useState("");
  const [counterpartyPickId, setCounterpartyPickId] = useState("");
  const clauseSubjectOptions = allPicks.filter(({ pick }) => (
    pick.tradable
    && postTradeOwner(pick.id) === team.code
    && canReuseConditionedPick(pick)
    && !reservedPickIds.has(pick.id)
    && (pickClause === "swap" || pickMoves.some((move) => move.id === pick.id))
  ));
  const selectedClausePick = clauseSubjectOptions.find(({ pick }) => pick.id === clausePickId)?.pick;
  const clauseCounterpartyOptions = allPicks.filter(({ pick }) => {
    if (!selectedClausePick || pickClause === "none") return false;
    if (pick.id === selectedClausePick.id || !canReuseConditionedPick(pick) || reservedPickIds.has(pick.id)) return false;
    if (!participantCodes.includes(postTradeOwner(pick.id))) return false;
    const subjectMove = pickMoves.find((move) => move.id === selectedClausePick.id);
    if (pickClause === "swap") {
      return postTradeOwner(pick.id) !== team.code
        && pick.year === selectedClausePick.year
        && pick.round === selectedClausePick.round;
    }
    return subjectMove !== undefined
      && postTradeOwner(pick.id) === subjectMove.fromTeamCode
      && isLaterDraftPick(pick.year, pick.round, selectedClausePick.year, selectedClausePick.round)
      && protectionCounterpartyDraftYears.includes(pick.year);
  });
  const selectedCounterparty = clauseCounterpartyOptions.find(({ pick }) => pick.id === counterpartyPickId)?.pick;
  const teamClauseAgreements = pickClauses.filter((agreement) => postTradeOwner(agreement.pickId) === team.code);
  const teamExistingClauses = existingClauseAgreements.filter((agreement) => (
    participantCodes.includes(agreement.subjectOwnerTeamCode)
    && participantCodes.includes(agreement.counterpartyOwnerTeamCode)
    && postTradeOwner(agreement.subjectPickId) === team.code
  ));

  function selectPlayer(nextId: string) {
    setPlayerId(nextId);
    const player = otherParticipants.flatMap((participant) => participant.players)
      .find((item) => item.id === nextId);
    setDestinationSlot(player ? player.allowedDestinations[0] : "regular");
  }

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
      role: selectedPlayer.role,
      sourceSlot: selectedPlayer.slot,
      destinationSlot,
      allowedDestinationSlots: selectedPlayer.allowedDestinations,
      fromTeamCode: selectedPlayerSource.code,
      toTeamCode: team.code,
    });
    setPlayerId("");
    setDestinationSlot("regular");
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
    if (!selectedCut) return;
    onAddCut({
      id: selectedCut.id,
      teamCode: team.code,
      name: selectedCut.name,
      cost: selectedCut.capCost,
      contract: selectedCut.contract,
      role: selectedCut.role,
      slot: selectedCut.slot,
    });
    setCutId("");
  }

  function selectPromotion(nextId: string) {
    setPromotionId(nextId);
    const player = team.players.find((item) => item.id === nextId);
    setPromotionDestinationSlot(player?.promotionDestinations[0] ?? "regular");
  }

  function addPromotion() {
    if (!selectedPromotion || !promotionDestinations.includes(promotionDestinationSlot)) return;
    onAddPromotion({
      id: selectedPromotion.id,
      teamCode: team.code,
      name: selectedPromotion.name,
      sourceSlot: selectedPromotion.slot as Exclude<TradeSlot, "dpe">,
      destinationSlot: promotionDestinationSlot,
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
        <select value={team.code} disabled={locked} onChange={(event) => onTeamChange(event.target.value)}>
          {allTeams.map((option) => (
            <option
              value={option.code}
              key={option.code}
              disabled={option.code !== team.code && participantCodes.includes(option.code)}
            >
              {formatTeamName(option.name)}
            </option>
          ))}
        </select>
        {canRemove && (
          <button type="button" onClick={onRemove} aria-label={`Rimuovi ${formatTeamName(team.name)}`}>×</button>
        )}
      </div>

      <section className="trade-asset-section">
        <span className="trade-section-label">Giocatori ricevuti</span>
        <div className="trade-composer player">
          <select value={playerId} onChange={(event) => selectPlayer(event.target.value)}>
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
          <select
            value={destinationSlot}
            onChange={(event) => setDestinationSlot(event.target.value as TradeSlot)}
            disabled={!selectedPlayer}
            aria-label="Slot di destinazione"
          >
            {allowedDestinations.map((slot) => (
              <option value={slot} key={slot}>{slotLabel(slot)}</option>
            ))}
          </select>
          <button type="button" onClick={addPlayer} disabled={!selectedPlayer}>Aggiungi</button>
        </div>
        <AssetList
          items={receivedPlayers.map((move) => ({
            id: move.id,
            primary: move.name,
            secondary: `da ${teamName(move.fromTeamCode, allTeams)} · ${slotLabel(move.destinationSlot)} · ${move.cost} · ${move.contract}${move.newSigning ? " · Nuova firma" : ""}`,
          }))}
          empty="Nessun giocatore ricevuto"
          onRemove={onRemovePlayer}
        />
      </section>

      <section className="trade-asset-section">
        <span className="trade-section-label">Scelte ricevute</span>
        <div className="trade-composer pick">
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
          </select>
          <button type="button" onClick={addCut} disabled={!selectedCut}>Taglia</button>
        </div>
        <AssetList
          items={teamCuts.map((cut) => ({
            id: cut.id,
            primary: cut.name,
            secondary: `libera ${slotLabel(cut.slot)} · resta a cap`,
          }))}
          empty="Nessun taglio"
          onRemove={onRemoveCut}
        />
      </section>

      <section className="trade-asset-section cut">
        <span className="trade-section-label">Promozioni contestuali</span>
        <div className="trade-composer promotion">
          <select value={promotionId} onChange={(event) => selectPromotion(event.target.value)}>
            <option value="">Seleziona giocatore</option>
            {availableOwnPlayers.filter((player) => player.promotionDestinations.length > 0).map((player) => (
              <option value={player.id} key={player.id}>
                {playerOptionLabel(player)}
              </option>
            ))}
          </select>
          <select
            value={promotionDestinationSlot}
            onChange={(event) => setPromotionDestinationSlot(event.target.value as Exclude<TradeSlot, "dpe">)}
            disabled={!selectedPromotion}
            aria-label="Destinazione della promozione"
          >
            {promotionDestinations.map((slot) => <option value={slot} key={slot}>{slotLabel(slot)}</option>)}
          </select>
          <button type="button" onClick={addPromotion} disabled={!selectedPromotion}>Promuovi</button>
        </div>
        <AssetList
          items={teamPromotions.map((promotion) => ({
            id: promotion.id,
            primary: promotion.name,
            secondary: `${slotLabel(promotion.sourceSlot)} → ${slotLabel(promotion.destinationSlot)}`,
          }))}
          empty="Nessuna promozione"
          onRemove={onRemovePromotion}
        />
      </section>

      <section className="trade-asset-section trade-clause-section">
        <span className="trade-section-label">Clausole a favore della squadra</span>
        <div className="trade-composer pick">
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
            {clauseSubjectOptions.map(({ pick }) => (
              <option value={pick.id} key={pick.id}>{pickOptionLabel(pick)}</option>
            ))}
          </select>
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
        <AssetList
          items={teamClauseAgreements.map((agreement) => ({
            id: agreement.id,
            primary: agreement.pickTitle,
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
  return `${player.name} · ${player.cost} · ${slotLabel(player.slot)} · ${player.contract} · ${player.role ?? "—"}`;
}

export function tradeSimulationRecap({
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
}) {
  const lines = ["SCAMBIO SIMULATO"];
  const movedPickIds = new Set(pickMoves.map((move) => move.id));

  participantCodes.forEach((teamCode) => {
    const outgoing = [
      ...playerMoves
        .filter((move) => move.fromTeamCode === teamCode)
        .map((move) => `${move.name} (${move.cost} crediti, ${move.contract}; ${slotLabel(move.sourceSlot)})`),
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
        .map((move) => `${move.name} (${move.cost} crediti, ${move.contract}; ${slotLabel(move.destinationSlot)})`),
      ...pickMoves
        .filter((move) => move.toTeamCode === teamCode)
        .map((move) => `Scelta ${pickTitle(move)}`),
      ...qualifyingOfferMoves
        .filter((move) => move.toTeamCode === teamCode)
        .map((move) => `Q.O. ${move.playerName} (${move.amount} crediti)`),
    ];
    const operations = [
      ...cuts
        .filter((cut) => cut.teamCode === teamCode)
        .map((cut) => `Taglio contestuale: ${cut.name}`),
      ...promotions
        .filter((promotion) => promotion.teamCode === teamCode)
        .map((promotion) => `Promozione: ${promotion.name}, ${slotLabel(promotion.sourceSlot)} -> ${slotLabel(promotion.destinationSlot)}`),
    ];
    const clauses = [
      ...pickClauses.flatMap((clause) => {
        const subjectMoved = movedPickIds.has(clause.pickId);
        const subjectNote = `${subjectMoved ? "scelta ceduta" : "scelta"} ${clause.pickTitle}`;
        if (clause.pickOwnerTeamCode === teamCode) {
          return [`Clausola inserita sulla ${subjectNote}: ${pickClauseAgreementLabel(clause, teams)}`];
        }
        if (clause.counterpartyTeamCode === teamCode && clause.counterpartyTitle) {
          const role = clause.clause === "swap" ? "Controparte dello swap" : "Contropartita della protezione";
          return [`${role}: ${clause.counterpartyTitle}, collegata alla ${subjectNote} (${teamName(clause.pickOwnerTeamCode, teams)})`];
        }
        return [];
      }),
      ...existingClauseChanges.flatMap((change) => {
        const agreement = existingClauseAgreements.find((item) => item.agreementId === change.agreementId);
        if (!agreement || (agreement.subjectOwnerTeamCode !== teamCode && agreement.counterpartyOwnerTeamCode !== teamCode)) return [];
        return [`Clausola rimossa: ${agreement.label}`];
      }),
    ];

    lines.push("", teamName(teamCode, teams).toUpperCase());
    lines.push(`Cede: ${outgoing.length ? outgoing.join("; ") : "—"}`);
    lines.push(`Riceve: ${incoming.length ? incoming.join("; ") : "—"}`);
    if (operations.length) lines.push(`Operazioni contestuali: ${operations.join("; ")}`);
    if (clauses.length) lines.push(`Clausole: ${clauses.join("; ")}`);
  });
  return lines.join("\n");
}

function pickTitle(pick: Pick<PickMove, "year" | "round" | "originOrOverall">) {
  return `${pick.year} · ${pick.round} · ${pick.originOrOverall}`;
}

function isLaterDraftPick(counterpartyYear: number, counterpartyRound: string, subjectYear: number, subjectRound: string) {
  if (counterpartyYear > subjectYear) return true;
  return counterpartyYear === subjectYear
    && subjectRound.trim().startsWith("1")
    && counterpartyRound.trim().startsWith("2");
}

function pickOptionLabel(pick: DraftPick) {
  return `${pickTitle(pick)}${pick.label !== "Scelta" ? ` · ${pick.label}` : ""}${!pick.tradable ? " · non scambiabile" : ""}`;
}

function pickClauseAgreementLabel(agreement: PickClauseAgreement, teams: TradeTeam[]) {
  if (agreement.clause === "none") return "";
  const counterparty = agreement.counterpartyTitle && agreement.counterpartyTeamCode
    ? `${agreement.counterpartyTitle} (${teamName(agreement.counterpartyTeamCode, teams)})`
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
