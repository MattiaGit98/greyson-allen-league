"use client";

import { useMemo, useState } from "react";
import {
  evaluateTrade,
  type TradeCut,
  type TradeExistingClauseChange,
  type TradePickClauseAgreement,
  type TradePickClause,
  type TradePickMove,
  type TradePlayerMove,
  type TradeQualifyingOfferMove,
  type TradeSlot,
} from "@/lib/rules/trade";
import { countRosterRoles } from "@/lib/rules/roster";
import { CapForceControl } from "@/app/admin/cap-force-control";
import { registerTrade } from "./actions";
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

export function TradeBuilder({
  phase,
  tradeDeadlinePassed,
  tradesOpen,
  tradableDraftYears,
  protectionCounterpartyDraftYears,
  existingClauseAgreements,
  signAndTrade,
  teams,
}: {
  phase: string;
  tradeDeadlinePassed: boolean;
  tradesOpen: boolean;
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
}) {
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
  const [clausePickId, setClausePickId] = useState("");
  const [pickClause, setPickClause] = useState<TradePickClause>("none");
  const [counterpartyPickId, setCounterpartyPickId] = useState("");
  const [existingClauseChanges, setExistingClauseChanges] = useState<TradeExistingClauseChange[]>([]);
  const [forceCap, setForceCap] = useState(false);

  const participants = participantCodes
    .map((code) => teams.find((team) => team.code === code))
    .filter((team): team is TradeTeam => Boolean(team));

  const reservedPickIds = new Set(pickClauses.flatMap((agreement) => (
    [agreement.pickId, ...(agreement.counterpartyPickId ? [agreement.counterpartyPickId] : [])]
  )));
  const clausePicksByTeam = participants.map((ownerTeam) => ({
    team: ownerTeam,
    picks: ownerTeam.picks.filter((pick) => (
      pick.tradable && !pick.hasExistingCondition && !reservedPickIds.has(pick.id)
    )),
  }));
  const selectedClausePickOwner = participants.find((ownerTeam) => (
    ownerTeam.picks.some((pick) => pick.id === clausePickId)
  ));
  const selectedClausePick = selectedClausePickOwner?.picks.find((pick) => pick.id === clausePickId);
  const counterpartyPicksByTeam = participants.map((ownerTeam) => ({
    team: ownerTeam,
    picks: ownerTeam.picks.filter((pick) => {
      if (!selectedClausePick || pickClause === "none") return false;
      if (pick.id === selectedClausePick.id || pick.hasExistingCondition || reservedPickIds.has(pick.id)) return false;
      if (pickClause === "swap") {
        return ownerTeam.code !== selectedClausePickOwner?.code
          && pick.year === selectedClausePick.year
          && pick.round === selectedClausePick.round;
      }
      return ownerTeam.code === selectedClausePickOwner?.code
        && pick.year >= selectedClausePick.year
        && protectionCounterpartyDraftYears.includes(pick.year);
    }),
  }));
  const selectedCounterpartyOwner = participants.find((ownerTeam) => (
    counterpartyPicksByTeam
      .find(({ team: candidateTeam }) => candidateTeam.code === ownerTeam.code)
      ?.picks.some((pick) => pick.id === counterpartyPickId)
  ));
  const selectedCounterparty = selectedCounterpartyOwner?.picks.find(
    (pick) => pick.id === counterpartyPickId,
  );

  const evaluation = useMemo(() => evaluateTrade({
    phase,
    tradeDeadlinePassed,
    tradesOpen,
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
    pickMoves,
    pickClauses: pickClauses.map((agreement) => ({
      ...agreement,
      pickTransferred: pickMoves.some((move) => move.id === agreement.pickId),
      counterpartyOwnerTeamCode: agreement.counterpartyTeamCode,
    })),
    existingClauseChanges,
    qualifyingOfferMoves,
    cuts,
  }), [cuts, existingClauseChanges, participants, phase, pickClauses, pickMoves, playerMoves, protectionCounterpartyDraftYears, qualifyingOfferMoves, tradableDraftYears, tradeDeadlinePassed, tradesOpen]);
  const capWarnings = [...new Set([
    ...(signAndTrade?.capWarnings ?? []),
    ...evaluation.warnings
      .filter((warning) => warning.code.includes("CAP"))
      .map((warning) => displayIssue(warning.message, teams)),
  ])];

  function changeParticipant(previousCode: string, nextCode: string) {
    if (previousCode === signAndTrade?.signerTeamCode) return;
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
    setExistingClauseChanges([]);
    resetPickClauseComposer();
  }

  function removeParticipant(teamCode: string) {
    if (participantCodes.length <= 2 || teamCode === signAndTrade?.signerTeamCode) return;
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
    setExistingClauseChanges([]);
    resetPickClauseComposer();
  }

  function addParticipant() {
    const nextTeam = teams.find((team) => !participantCodes.includes(team.code));
    if (nextTeam) setParticipantCodes((current) => [...current, nextTeam.code]);
  }

  function resetPickClauseComposer() {
    setClausePickId("");
    setPickClause("none");
    setCounterpartyPickId("");
  }

  function addPickClause() {
    if (!selectedClausePick || !selectedClausePickOwner || pickClause === "none") return;
    if (!selectedCounterparty || !selectedCounterpartyOwner) return;
    setPickClauses((current) => [...current, {
      id: `${selectedClausePickOwner.code}:clause:${selectedClausePick.id}`,
      pickId: selectedClausePick.id,
      pickOwnerTeamCode: selectedClausePickOwner.code,
      beneficiaryTeamCode: selectedClausePickOwner.code,
      year: selectedClausePick.year,
      round: selectedClausePick.round,
      hasExistingCondition: selectedClausePick.hasExistingCondition,
      clause: pickClause,
      counterpartyPickId: selectedCounterparty?.id ?? null,
      counterpartyYear: selectedCounterparty?.year ?? null,
      counterpartyRound: selectedCounterparty?.round ?? null,
      counterpartyHasExistingCondition: selectedCounterparty?.hasExistingCondition ?? false,
      pickTitle: pickTitle(selectedClausePick),
      pickOwnerName: formatTeamName(selectedClausePickOwner.name),
      counterpartyTitle: selectedCounterparty ? pickTitle(selectedCounterparty) : null,
      counterpartyTeamCode: selectedCounterpartyOwner?.code ?? null,
    }]);
    resetPickClauseComposer();
  }

  return (
    <form action={registerTrade} className="trade-builder">
      <input
        type="hidden"
        name="trade_json"
        value={JSON.stringify({
          signAndTrade: signAndTrade?.request ?? null,
          participantCodes,
          playerMoves,
          pickMoves,
          pickClauses,
          qualifyingOfferMoves,
          existingClauseChanges,
          cuts,
        })}
      />
      <input type="hidden" name="force_cap" value={String(forceCap)} />
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
          <a href={signAndTrade.request.kind === "draft" ? "/admin/draft" : "/admin/free-agent"}>Annulla</a>
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
            playerMoves={playerMoves}
            pickMoves={pickMoves}
            qualifyingOfferMoves={qualifyingOfferMoves}
            cuts={cuts}
            canRemove={participants.length > 2 && team.code !== signAndTrade?.signerTeamCode}
            locked={team.code === signAndTrade?.signerTeamCode}
            onTeamChange={(nextCode) => changeParticipant(team.code, nextCode)}
            onRemove={() => removeParticipant(team.code)}
            onAddPlayer={(move) => setPlayerMoves((current) => [...current, move])}
            onRemovePlayer={(id) => setPlayerMoves((current) => current.filter((move) => move.id !== id))}
            onAddPick={(move) => setPickMoves((current) => [...current, move])}
            onRemovePick={(id) => setPickMoves((current) => current.filter((move) => move.id !== id))}
            onAddQualifyingOffer={(move) => setQualifyingOfferMoves((current) => [...current, move])}
            onRemoveQualifyingOffer={(id) => setQualifyingOfferMoves((current) => current.filter((move) => move.id !== id))}
            onAddCut={(cut) => setCuts((current) => [...current, cut])}
            onRemoveCut={(id) => setCuts((current) => current.filter((cut) => cut.id !== id))}
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
                <span>Roster<b>{result.slots.regular} / 15</b></span>
                <span>Two-way<b>{result.slots.twoWay} / 2</b></span>
                <span>G-League<b>{result.slots.gLeague} / 3</b></span>
                <span>DPE<b>{result.slots.dpe} / 1</b></span>
              </div>
            </article>
          );
        })}
      </div>

      <section className="trade-clause-workspace">
        <span className="trade-section-label">Clausole inserite</span>
        <div className="trade-composer pick">
          <select
            value={clausePickId}
            onChange={(event) => {
              setClausePickId(event.target.value);
              setPickClause("none");
              setCounterpartyPickId("");
            }}
          >
            <option value="">Seleziona scelta</option>
            {clausePicksByTeam.map(({ team: ownerTeam, picks }) => (
              <optgroup label={formatTeamName(ownerTeam.name)} key={ownerTeam.code}>
                {picks.map((pick) => (
                  <option value={pick.id} key={pick.id}>{pickOptionLabel(pick)}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            value={pickClause}
            onChange={(event) => {
              setPickClause(event.target.value as TradePickClause);
              setCounterpartyPickId("");
            }}
            disabled={!selectedClausePick}
            aria-label="Clausola della scelta"
          >
            <option value="none">Seleziona clausola</option>
            <option value="swap">Diritto di swap</option>
            {Array.from({ length: 13 }, (_, index) => index + 1).map((position) => (
              <option value={`protected_top_${position}`} key={position}>Protetta top {position}</option>
            ))}
          </select>
          <select
            value={counterpartyPickId}
            onChange={(event) => setCounterpartyPickId(event.target.value)}
            disabled={!selectedClausePick || pickClause === "none"}
            aria-label="Scelta di contropartita"
          >
            <option value="">Seleziona contropartita</option>
            {counterpartyPicksByTeam.map(({ team: ownerTeam, picks }) => (
              <optgroup label={formatTeamName(ownerTeam.name)} key={ownerTeam.code}>
                {picks.map((pick) => (
                  <option value={pick.id} key={pick.id}>{pickOptionLabel(pick)}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            onClick={addPickClause}
            disabled={
              !selectedClausePick
              || pickClause === "none"
              || !selectedCounterparty
            }
          >
            Aggiungi
          </button>
        </div>
        <AssetList
          items={pickClauses.map((agreement) => ({
            id: agreement.id,
            primary: `${agreement.pickTitle} (${agreement.pickOwnerName})`,
            secondary: pickClauseAgreementLabel(agreement, teams),
          }))}
          empty="Nessuna clausola inserita"
          onRemove={(id) => setPickClauses((current) => current.filter((clause) => clause.id !== id))}
        />

        <div className="trade-existing-clauses">
          <span className="trade-section-label">Accordi esistenti</span>
          {existingClauseAgreements
            .filter((agreement) => (
              participantCodes.length === 2
              &&
              participantCodes.includes(agreement.subjectOwnerTeamCode)
              && participantCodes.includes(agreement.counterpartyOwnerTeamCode)
            ))
            .map((agreement) => {
              const change = existingClauseChanges.find((item) => item.agreementId === agreement.agreementId);
              const value = change?.action === "remove" ? "remove" : change?.clause ?? "keep";
              return (
                <label className="trade-existing-clause-row" key={agreement.agreementId}>
                  <span>{agreement.label}</span>
                  <select
                    value={value}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setExistingClauseChanges((current) => {
                        const others = current.filter((item) => item.agreementId !== agreement.agreementId);
                        if (nextValue === "keep") return others;
                        return [...others, {
                          agreementId: agreement.agreementId,
                          subjectOwnerTeamCode: agreement.subjectOwnerTeamCode,
                          counterpartyOwnerTeamCode: agreement.counterpartyOwnerTeamCode,
                          subjectYear: agreement.subjectYear,
                          counterpartyYear: agreement.counterpartyYear,
                          subjectRound: agreement.round,
                          counterpartyRound: agreement.round,
                          action: nextValue === "remove" ? "remove" : "modify",
                          clause: nextValue === "remove" ? null : nextValue as Exclude<TradePickClause, "none">,
                        }];
                      });
                    }}
                  >
                    <option value="keep">Mantieni invariato</option>
                    <option value="remove">Elimina accordo</option>
                    <option value="swap">Diritto di swap</option>
                    {Array.from({ length: 13 }, (_, index) => index + 1).map((position) => (
                      <option value={`protected_top_${position}`} key={position}>Protetta top {position}</option>
                    ))}
                  </select>
                </label>
              );
            })}
        </div>
      </section>

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
        {evaluation.valid && !evaluation.warnings.length && (
          <p className="validation success">Controlli regolamentari superati.</p>
        )}
      </div>

      <CapForceControl warnings={capWarnings} checked={forceCap} onChange={setForceCap} />

      <button
        className="button primary trade-submit"
        type="submit"
        disabled={!evaluation.valid || (capWarnings.length > 0 && !forceCap)}
      >
        {evaluation.valid ? "Registra scambio" : "Operazione non disponibile"}
      </button>
    </form>
  );
}

function TradeTeamCard({
  team,
  allTeams,
  participants,
  participantCodes,
  phase,
  playerMoves,
  pickMoves,
  qualifyingOfferMoves,
  cuts,
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
}: {
  team: TradeTeam;
  allTeams: TradeTeam[];
  participants: TradeTeam[];
  participantCodes: string[];
  phase: string;
  playerMoves: PlayerMove[];
  pickMoves: PickMove[];
  qualifyingOfferMoves: QualifyingOfferMove[];
  cuts: CutMove[];
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
}) {
  const [playerId, setPlayerId] = useState("");
  const [destinationSlot, setDestinationSlot] = useState<TradeSlot>("regular");
  const [pickId, setPickId] = useState("");
  const [qualifyingOfferId, setQualifyingOfferId] = useState("");
  const [cutId, setCutId] = useState("");

  const unavailableIds = new Set([
    ...playerMoves.map((move) => move.id),
    ...cuts.map((cut) => cut.id),
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
  const allowedDestinations = selectedPlayer
    ? selectedPlayer.allowedDestinations
    : ["regular" as TradeSlot];
  const receivedPlayers = playerMoves.filter((move) => move.toTeamCode === team.code);
  const receivedPicks = pickMoves.filter((move) => move.toTeamCode === team.code);
  const receivedQualifyingOffers = qualifyingOfferMoves.filter((move) => move.toTeamCode === team.code);
  const teamCuts = cuts.filter((cut) => cut.teamCode === team.code);

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
    if (!selectedQualifyingOffer || !selectedQualifyingOfferSource || phase !== "offseason") return;
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
                    {player.name} · {player.cost} · {slotLabel(player.slot)}{player.newSigning ? " · Nuova firma" : ""}
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
        <div className="trade-composer cut">
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

      <section className="trade-asset-section">
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
      </section>

      <section className="trade-asset-section cut">
        <span className="trade-section-label">Tagli contestuali</span>
        <div className="trade-composer cut">
          <select value={cutId} onChange={(event) => setCutId(event.target.value)}>
            <option value="">Seleziona giocatore</option>
            {availableOwnPlayers.map((player) => (
              <option value={player.id} key={player.id}>
                {player.name} · {slotLabel(player.slot)}
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

function pickTitle(pick: Pick<PickMove, "year" | "round" | "originOrOverall">) {
  return `${pick.year} · ${pick.round} · ${pick.originOrOverall}`;
}

function pickOptionLabel(pick: DraftPick) {
  return `${pickTitle(pick)}${pick.label !== "Scelta" ? ` · ${pick.label}` : ""}`;
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
