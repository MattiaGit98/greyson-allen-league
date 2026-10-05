"use client";

import { useEffect, useMemo, useState } from "react";
import {
  auctionAcquisitionLabel,
  auctionDestinationErrors,
  isPostAuctionContractAssignmentCandidate,
  qualifyingAuctionErrors,
  auctionSlotLimits,
  type AuctionSlot,
  type QualifyingAuctionOutcome,
} from "@/lib/auction-management";
import type { AuctionAcquisitionKind } from "@/lib/league-types";
import { contractIncludesTeamOption, slotEligibilityErrors, slotMoveTimingErrors, type ManagedRosterSlot } from "@/lib/slot-eligibility";
import { CapBlocker } from "@/app/admin/cap-force-control";
import { ContextualSlotResolver } from "@/app/admin/contextual-slot-resolver";
import { UndoMovementButton } from "@/app/admin/movimenti/undo-movement-button";
import { resolveContextualSlots, type AppliedContextualSlotOperation, type ContextualSlotDecision } from "@/lib/contextual-slot-resolution";
import { annualTeamOptionContract, contractAfterRosterExit } from "@/lib/team-option-contract";
import { modifyAuctionPlayer, purchaseAuctionPlayer } from "./actions";

type AuctionTeam = {
  code: string;
  name: string;
  spaces: [number, number, number];
  slots: { regular: number; two_way: number; g_league: number };
  cutPlayerNames: string[];
  players: {
    name: string;
    role: "G" | "A" | "C" | null;
    cost: number;
    contract: string;
    slot: AuctionSlot;
    cuttable: boolean;
    freeReleasable: boolean;
    charges: [number, number, number];
    moveDestinations: AuctionSlot[];
  }[];
};

type AuctionRow = {
  name: string;
  role: "G" | "A" | "C" | "X";
  realTeam: string;
  rookie: boolean;
  under23: boolean;
  listOrder: number;
  roster: null | {
    teamCode: string;
    cost: number;
    contract: string;
    slot: "regular" | "two_way" | "g_league" | "dpe";
    auctionAcquisition?: AuctionAcquisitionKind;
    pendingAuctionContract: boolean;
    teamOptionFinalYear?: number;
    freeAgentSignedSeason?: string;
    endedPreviousSeasonInGLeague?: boolean;
    contractStartSeason?: string;
    twoWayPromotionLocked?: boolean;
    freeReleaseEligible: boolean;
    charges: [number, number, number];
  };
  qualifying: null | { teamCode: string; amount: number };
};

type AuctionDialogSelection = {
  name: string;
  mode: "purchase" | "operations";
};

export function AuctionPanel({
  rows,
  teams,
  phase,
  seasonName,
  pendingDraftPicks,
  assignmentUndos,
  initialOnlyAuctionable,
}: {
  rows: AuctionRow[];
  teams: AuctionTeam[];
  phase: string;
  seasonName: string;
  pendingDraftPicks: number;
  initialOnlyAuctionable: boolean;
  assignmentUndos: Record<string, {
    movementId: string;
    summary: string;
    preview: { code: string; name: string; slotsBefore: { regular: number; two_way: number; g_league: number; dpe: number }; slotsAfter: { regular: number; two_way: number; g_league: number; dpe: number }; rolesBefore: { G: number; A: number; C: number }; rolesAfter: { G: number; A: number; C: number }; capSpaces: { seasonName: string; before: number; after: number }[] }[];
    roleMinimumConfirmationRequired: boolean;
    disabled: boolean;
  }>;
}) {
  const [query, setQuery] = useState("");
  const [onlyAuctionable, setOnlyAuctionable] = useState(initialOnlyAuctionable);
  const [dialogSelection, setDialogSelection] = useState<AuctionDialogSelection | null>(null);
  const selected = rows.find((row) => row.name === dialogSelection?.name) ?? null;
  const selectedDialogIsValid = Boolean(selected && (
    (dialogSelection?.mode === "purchase" && !selected.roster)
    || (dialogSelection?.mode === "operations" && selected.roster)
  ));
  const filtered = useMemo(() => rows.filter((row) => (
    (!onlyAuctionable || !row.roster)
    && row.name.toLocaleLowerCase("it").includes(query.trim().toLocaleLowerCase("it"))
  )), [onlyAuctionable, query, rows]);

  useEffect(() => {
    if (!initialOnlyAuctionable) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("onlyAstabili");
    window.history.replaceState(window.history.state, "", url);
  }, [initialOnlyAuctionable]);

  useEffect(() => {
    if (!dialogSelection) return;
    if (!selectedDialogIsValid) {
      setDialogSelection(null);
      return;
    }
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialogSelection(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [dialogSelection, selectedDialogIsValid]);

  return (
    <>
      <div className="auction-list-toolbar">
        <label className="auction-search search-field">
          <span>Cerca</span>
          <input value={query} onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            if (nextQuery) setOnlyAuctionable(false);
          }} placeholder="Nome del giocatore…" />
        </label>
        <label className="auction-only-auctionable">
          <input type="checkbox" checked={onlyAuctionable} onChange={(event) => setOnlyAuctionable(event.target.checked)} />
          <span>Solo astabili</span>
        </label>
      </div>

      <div className="auction-player-list">
        <div className="auction-player-head">
          <span>#</span><span>Giocatore</span><span>Ruolo</span><span>Squadra NBA</span><span>Stato</span><span></span><span></span>
        </div>
        {filtered.map((row) => {
          const assignmentUndo = assignmentUndos[row.name];
          return (
          <article className={`auction-player-row ${row.rookie ? "is-rookie" : ""} ${row.under23 ? "is-under23" : ""}`} key={row.listOrder}>
            <span className="player-order">{row.listOrder}</span>
            <span className="player-identity">
              <strong className="player-name">{row.name}</strong>
              <span className="auction-player-subline">
                {row.realTeam && <small className="real-team-text">{row.realTeam}</small>}
                {row.rookie && <i className="player-flag player-flag-rookie">Rookie</i>}
                {row.under23 && <i className="player-flag player-flag-u23">U23</i>}
              </span>
            </span>
            <span><i className={`mini-role mini-role-${row.role.toLowerCase()}`}>{row.role}</i></span>
            <strong className="real-team">{row.realTeam || "—"}</strong>
            <AuctionStatus row={row} />
            <button className={`auction-row-action ${row.roster ? "edit" : "bid"}`} type="button" onClick={() => setDialogSelection({
              name: row.name,
              mode: row.roster ? "operations" : "purchase",
            })}>
              {row.roster ? "Operazioni" : "Asta"}
            </button>
            {assignmentUndo ? <UndoMovementButton
              movementId={assignmentUndo.movementId}
              summary={assignmentUndo.summary}
                preview={assignmentUndo.preview}
                roleMinimumConfirmationRequired={assignmentUndo.roleMinimumConfirmationRequired}
                disabled={assignmentUndo.disabled || phase !== "auction"}
              triggerLabel="×"
              triggerClassName="auction-row-undo"
              triggerAriaLabel={`Annulla assegnazione di ${row.name}`}
              requireExplicitConfirmation
              returnPath="/admin/asta"
              auctionAssignmentOnly
            /> : <button className="auction-row-undo" type="button" disabled aria-label={`Nessuna assegnazione d’asta annullabile per ${row.name}`}>×</button>}
          </article>
          );
        })}
        {!filtered.length && <div className="data-empty">{rows.length ? "Nessun giocatore trovato" : "Listone non ancora pubblicato"}</div>}
      </div>

      {selected && dialogSelection && selectedDialogIsValid && (
        <div className="auction-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDialogSelection(null);
        }}>
          {dialogSelection.mode === "operations"
            ? <EditPlayerDialog key={`edit-${selected.name}`} row={selected} rows={rows} teams={teams} phase={phase} seasonName={seasonName} pendingDraftPicks={pendingDraftPicks} onlyAuctionable={onlyAuctionable} onClose={() => setDialogSelection(null)} />
            : <PurchasePlayerDialog key={`buy-${selected.name}`} row={selected} rows={rows} teams={teams} phase={phase} seasonName={seasonName} pendingDraftPicks={pendingDraftPicks} onlyAuctionable={onlyAuctionable} onClose={() => setDialogSelection(null)} />}
        </div>
      )}
    </>
  );
}

function PurchasePlayerDialog({ row, teams, phase, seasonName, pendingDraftPicks = 0, onlyAuctionable, onClose }: DialogProps & { pendingDraftPicks?: number }) {
  const [teamCode, setTeamCode] = useState(teams[0]?.code ?? "");
  const [price, setPrice] = useState(1);
  const [slot, setSlot] = useState<AuctionSlot>("regular");
  const [slotDecisions, setSlotDecisions] = useState<ContextualSlotDecision[]>([]);
  const [qualifyingOutcome, setQualifyingOutcome] = useState<QualifyingAuctionOutcome | "">(row.qualifying ? "" : "normal");
  const constrainedAcquisition = qualifyingOutcome === "qualifying_offer" || qualifyingOutcome === "restricted_free_agent";
  const effectiveTeamCode = constrainedAcquisition ? row.qualifying?.teamCode ?? "" : teamCode;
  const effectivePrice = qualifyingOutcome === "qualifying_offer" ? row.qualifying?.amount ?? 0 : price;
  const effectiveSlot: AuctionSlot = constrainedAcquisition ? "regular" : slot;
  const team = teams.find((item) => item.code === effectiveTeamCode) ?? teams[0];
  const slotResolutionPlayers = (team?.players ?? []).map((player) => ({
    name: player.name,
    slot: player.slot,
    cuttable: player.cuttable,
    freeReleasable: player.freeReleasable,
    moveDestinations: player.moveDestinations,
  }));
  const slotResolution = resolveContextualSlots({
    counts: team?.slots ?? { regular: 0, two_way: 0, g_league: 0 },
    incomingSlot: effectiveSlot,
    players: slotResolutionPlayers,
    decisions: slotDecisions,
  });
  const errors = [
    ...(phase !== "auction" ? ["La fase della lega non è impostata su Asta."] : []),
    ...(pendingDraftPicks > 0 ? [`Il Draft dell'annata non è completo: restano ${pendingDraftPicks} scelte.`] : []),
    ...qualifyingAuctionErrors({
      hasQualifyingRight: Boolean(row.qualifying),
      outcome: qualifyingOutcome,
      rightTeamCode: row.qualifying?.teamCode,
      rightAmount: row.qualifying?.amount,
      teamCode: effectiveTeamCode,
      price: effectivePrice,
      slot: effectiveSlot,
    }),
    ...auctionDestinationErrors({ slot: effectiveSlot, price: effectivePrice, rookie: row.rookie, under23: row.under23 }),
  ];
  const releasedCap = slotResolution.operations
    .filter((operation) => operation.kind === "free_release")
    .reduce((total, operation) => total + (team?.players.find((player) => player.name === operation.playerName)?.charges[0] ?? 0), 0);
  const capAfterPurchase = team ? team.spaces[0] - effectivePrice + releasedCap : 0;
  const capWarnings = (team && capAfterPurchase < 0 && effectivePrice > 1)
    ? [`L'offerta supera quota 1000: in asta sarebbe consentito soltanto un acquisto da 1 credito (cap libero ${team.spaces[0]} → ${capAfterPurchase}).`]
    : [];
  const afterSlots = team ? slotResolution.countsAfter : null;
  const slotLimit = effectiveSlot === "regular" ? 15 : effectiveSlot === "two_way" ? 2 : 3;
  const slotErrors = slotResolution.errors;
  const qoTeam = row.qualifying ? teams.find((item) => item.code === row.qualifying?.teamCode) : null;

  return (
    <form action={purchaseAuctionPlayer} className="auction-modal" role="dialog" aria-modal="true" aria-label={`Asta per ${row.name}`}>
      <input type="hidden" name="player_name" value={row.name} />
      <input type="hidden" name="team_code" value={effectiveTeamCode} />
      <input type="hidden" name="price" value={effectivePrice} />
      <input type="hidden" name="slot" value={effectiveSlot} />
      <input type="hidden" name="slot_resolution_json" value={JSON.stringify(slotDecisions)} />
      <input type="hidden" name="qualifying_outcome" value={qualifyingOutcome} />
      <input type="hidden" name="only_auctionable" value={onlyAuctionable ? "1" : "0"} />
      <ModalHeader row={row} label="Asta" onClose={onClose} />

      <div className="auction-modal-body">
        {row.qualifying && (
          <div className="auction-qo-owner">
            <span>Proprietario Q.O.</span>
            <strong>{qoTeam ? formatTeamName(qoTeam.name) : row.qualifying.teamCode}</strong>
            <small>{row.qualifying.amount} crediti</small>
          </div>
        )}
        <div className={`auction-modal-fields auction-purchase-fields${row.qualifying ? " qualifying-outcome-layout" : ""}`}>
          {row.qualifying && (
            <Field label="Esito Q.O." className="field-qualifying-outcome">
              <select value={qualifyingOutcome} onChange={(event) => {
                const outcome = event.target.value as QualifyingAuctionOutcome | "";
                setQualifyingOutcome(outcome);
                setSlotDecisions([]);
                if (outcome === "qualifying_offer" || outcome === "restricted_free_agent") setSlot("regular");
              }}>
                <option value="">Seleziona l'esito</option>
                <option value="normal">Asta normale</option>
                <option value="qualifying_offer">Q.O. accettata</option>
                <option value="restricted_free_agent">Restricted free agent</option>
              </select>
            </Field>
          )}
          <Field label="Squadra acquirente" className="field-team">
            <select value={effectiveTeamCode} disabled={constrainedAcquisition} onChange={(event) => { setTeamCode(event.target.value); setSlotDecisions([]); }}>
              {teams.map((item) => <option value={item.code} key={item.code}>{formatTeamName(item.name)}</option>)}
            </select>
          </Field>
          <Field label="Prezzo" className="field-price">
            <input type="number" min="1" step="1" inputMode="numeric" value={effectivePrice} disabled={qualifyingOutcome === "qualifying_offer"} onChange={(event) => { setPrice(Number(event.target.value)); }} />
          </Field>
          <Field label="Slot" className="field-slot">
            <select value={effectiveSlot} disabled={constrainedAcquisition} onChange={(event) => {
              setSlot(event.target.value as AuctionSlot);
              setSlotDecisions([]);
            }}>
              <option value="regular">Roster</option>
              <option value="two_way">Two-way</option>
              <option value="g_league">G-League</option>
            </select>
          </Field>
        </div>

        <ContextualSlotResolver
          counts={team?.slots ?? { regular: 0, two_way: 0, g_league: 0 }}
          incomingSlot={effectiveSlot}
          players={slotResolutionPlayers}
          value={slotDecisions}
          onChange={setSlotDecisions}
        />

        <div className="auction-modal-summary">
          <Metric label={`Cap libero ${seasonName}`} value={team ? `${team.spaces[0]} → ${capAfterPurchase}` : "—"} />
          <Metric label="Slot" value={team && afterSlots ? `${team.slots[effectiveSlot]}/${slotLimit} → ${afterSlots[effectiveSlot]}/${slotLimit}` : "—"} />
          <Metric label="Acquisto" value={qualifyingOutcome ? auctionAcquisitionLabel(qualifyingOutcome === "qualifying_offer" || qualifyingOutcome === "restricted_free_agent" ? qualifyingOutcome : undefined) : "Da specificare"} />
        </div>
        <CutPlayerCheck names={team?.cutPlayerNames ?? []} />
        {slotErrors.map((error) => <p className="validation error" key={error}>{error}</p>)}
        {errors.map((error) => <p className="validation error" key={error}>{error}</p>)}
        <CapBlocker warnings={capWarnings} />
      </div>
      <div className="auction-modal-actions">
        <button className="button secondary" type="button" onClick={onClose}>Annulla</button>
        <button className="button primary" type="submit" disabled={errors.length > 0 || slotErrors.length > 0 || !slotResolution.complete || !team || capWarnings.length > 0}>Registra acquisto</button>
      </div>
    </form>
  );
}

function EditPlayerDialog({ row, rows, teams, phase, seasonName, pendingDraftPicks = 0, onlyAuctionable, onClose }: DialogProps & { pendingDraftPicks?: number }) {
  const roster = row.roster!;
  const [kind, setKind] = useState<"cut" | "free_release" | "slot">("cut");
  const [newSlot, setNewSlot] = useState<AuctionSlot>(roster.slot === "dpe" ? "regular" : roster.slot);
  const [slotDecisions, setSlotDecisions] = useState<ContextualSlotDecision[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const team = teams.find((item) => item.code === roster.teamCode);
  const availableSlotDestinations = legalAuctionSlotDestinations(row, seasonName);
  const slotResolutionPlayers = (team?.players ?? []).filter((player) => player.name !== row.name);
  const slotResolutionBaseCounts = team
    ? {
      ...team.slots,
      ...(roster.slot !== "dpe" ? { [roster.slot]: team.slots[roster.slot] - 1 } : {}),
    }
    : { regular: 0, two_way: 0, g_league: 0 };
  const slotResolution = resolveContextualSlots({
    counts: slotResolutionBaseCounts,
    incomingSlot: newSlot,
    players: slotResolutionPlayers,
    decisions: slotDecisions,
  });
  const slotsAfterMove = kind === "slot" ? slotResolution.countsAfter : null;
  const slotSummarySlots = kind === "slot"
    ? (["regular", "two_way", "g_league"] as AuctionSlot[]).filter((candidate) => (
      candidate === roster.slot
      || candidate === newSlot
      || slotResolution.operations.some((operation) => (
        operation.sourceSlot === candidate
        || (operation.kind === "move" && operation.destinationSlot === candidate)
      ))
    ))
    : [];
  const afterSpaces = editSpaces(row, rows, team, kind, newSlot, slotResolution.operations);
  const errors = [
    ...(phase !== "auction" ? ["La fase della lega non è impostata su Asta."] : []),
    ...(pendingDraftPicks > 0 ? [`Il Draft dell'annata non è completo: restano ${pendingDraftPicks} scelte.`] : []),
    ...(kind === "slot" && newSlot === roster.slot ? ["Seleziona uno slot diverso da quello attuale."] : []),
    ...(kind === "slot" && roster.slot === "dpe" ? ["Il reintegro dalla DPE va registrato nel blocco Altre operazioni."] : []),
    ...(kind === "slot" && roster.auctionAcquisition && newSlot !== "regular" ? ["Un acquisto tramite Q.O. o come RFA deve restare nello slot roster."] : []),
    ...(kind === "slot" ? auctionDestinationErrors({ slot: newSlot, price: roster.cost, rookie: row.rookie, under23: row.under23 }) : []),
    ...(kind === "slot" && !availableSlotDestinations.includes(newSlot) ? ["Lo spostamento selezionato non è consentito per questo giocatore."] : []),
    ...(kind === "slot" ? slotResolution.errors : []),
  ];
  const capWarnings = [
    ...((kind === "cut" && roster.slot === "dpe" && afterSpaces[0] < 0) ? [`Il taglio dalla DPE porta il cap libero a ${afterSpaces[0]}.`] : []),
    ...((kind === "slot" && roster.slot === "dpe" && afterSpaces[0] < 0) ? [`Lo spostamento dalla DPE porta il cap libero a ${afterSpaces[0]}.`] : []),
    ...(afterSpaces.slice(1).some((space) => space < 0) ? ["La modifica porta almeno una stagione futura oltre quota 1000."] : []),
  ];
  const details = modificationDetails(row, rows, kind, newSlot, team, afterSpaces, seasonName, slotResolution.operations);

  if (reviewing) {
    return (
      <form action={modifyAuctionPlayer} className="auction-modal auction-confirm-modal" role="alertdialog" aria-modal="true" aria-label={`Conferma operazione su ${row.name}`}>
        <EditHiddenFields row={row} kind={kind} newSlot={newSlot} slotDecisions={slotDecisions} onlyAuctionable={onlyAuctionable} />
        <ModalHeader row={row} label="Conferma operazione" onClose={onClose} />
        <div className="auction-confirm-body">
          <p>Stai per applicare questa operazione:</p>
          <strong>{details.title}</strong>
          <ul>{details.lines.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
        <div className="auction-modal-actions">
          <button className="button secondary" type="button" onClick={() => setReviewing(false)}>Indietro</button>
          <button className="button primary danger-button" type="submit" disabled={pendingDraftPicks > 0 || errors.length > 0 || capWarnings.length > 0 || (kind === "slot" && !slotResolution.complete)}>Conferma definitivamente</button>
        </div>
      </form>
    );
  }

  return (
    <div className="auction-modal" role="dialog" aria-modal="true" aria-label={`Operazioni per ${row.name}`}>
      <ModalHeader row={row} label="Operazioni" onClose={onClose} />
      <div className="auction-modal-body">
        <div className="auction-current-owner">
          <span>Squadra</span><strong>{team ? formatTeamName(team.name) : roster.teamCode}</strong>
          <small>{roster.cost} crediti · {slotLabel(roster.slot)} · {roster.pendingAuctionContract ? "Contratto da assegnare" : roster.contract}{roster.auctionAcquisition ? ` · ${auctionAcquisitionLabel(roster.auctionAcquisition)}` : ""}</small>
        </div>
        <div className="auction-modal-fields single-column">
          <Field label="Intervento">
            <select value={kind} onChange={(event) => {
              const nextKind = event.target.value as typeof kind;
              setKind(nextKind);
              if (nextKind === "slot") setNewSlot(availableSlotDestinations[0] ?? roster.slot as AuctionSlot);
              setSlotDecisions([]);
              setReviewing(false);
            }}>
              <option value="cut">Taglia</option>
              {roster.freeReleaseEligible && <option value="free_release">Rilascio gratuito</option>}
              {availableSlotDestinations.length > 0 && <option value="slot">Sposta di slot</option>}
            </select>
          </Field>
          {kind === "slot" && (
            <Field label="Nuovo slot">
              <select value={newSlot} onChange={(event) => { setNewSlot(event.target.value as AuctionSlot); setSlotDecisions([]); setReviewing(false); }}>
                {availableSlotDestinations.map((slot) => <option value={slot} key={slot}>{slotLabel(slot)}</option>)}
              </select>
            </Field>
          )}
        </div>
        {kind === "slot" && (
          <ContextualSlotResolver
            counts={slotResolutionBaseCounts}
            incomingSlot={newSlot}
            players={slotResolutionPlayers}
            value={slotDecisions}
            onChange={(next) => { setSlotDecisions(next); setReviewing(false); }}
          />
        )}
        <div className="auction-modal-summary cap-three-years">
          {afterSpaces.map((space, index) => (
            <Metric label={`Cap libero ${seasonLabel(seasonName, index)}`} value={team ? `${team.spaces[index]} → ${space}` : "—"} key={index} />
          ))}
          {kind === "slot" && team && slotsAfterMove && slotSummarySlots.map((slot) => (
            <Metric
              label={`Slot ${slotLabel(slot)}`}
              value={`${team.slots[slot]}/${auctionSlotLimits[slot]} → ${slotsAfterMove[slot]}/${auctionSlotLimits[slot]}`}
              key={slot}
            />
          ))}
        </div>
        {errors.map((error) => <p className="validation error" key={error}>{error}</p>)}
        <CapBlocker warnings={capWarnings} />
      </div>
      <div className="auction-modal-actions">
        <button className="button secondary" type="button" onClick={onClose}>Annulla</button>
        <button className="button primary" type="button" disabled={errors.length > 0 || capWarnings.length > 0 || (kind === "slot" && !slotResolution.complete)} onClick={() => setReviewing(true)}>Prosegui</button>
      </div>
    </div>
  );
}

function legalAuctionSlotDestinations(row: AuctionRow, seasonName: string): AuctionSlot[] {
  const roster = row.roster;
  if (!roster || roster.slot === "dpe") return [];
  return (["regular", "two_way", "g_league"] as AuctionSlot[]).filter((destination) => {
    if (destination === roster.slot) return false;
    if (roster.auctionAcquisition && destination !== "regular") return false;
    if (auctionDestinationErrors({ slot: destination, price: roster.cost, rookie: row.rookie, under23: row.under23 }).length) return false;
    const eligibilityEntry = { ...roster, slot: roster.slot as ManagedRosterSlot };
    if (slotMoveTimingErrors(eligibilityEntry, destination, seasonName, "auction_start").length) return false;
    return roster.pendingAuctionContract || isPostAuctionContractAssignmentCandidate(roster, seasonName)
      || slotEligibilityErrors(eligibilityEntry, destination, seasonName).length === 0;
  });
}

function EditHiddenFields({ row, kind, newSlot, slotDecisions, onlyAuctionable }: { row: AuctionRow; kind: string; newSlot: AuctionSlot; slotDecisions: ContextualSlotDecision[]; onlyAuctionable: boolean }) {
  return <>
    <input type="hidden" name="player_name" value={row.name} />
    <input type="hidden" name="team_code" value={row.roster?.teamCode ?? ""} />
    <input type="hidden" name="edit_kind" value={kind} />
    <input type="hidden" name="new_slot" value={newSlot} />
    <input type="hidden" name="slot_resolution_json" value={JSON.stringify(slotDecisions)} />
    <input type="hidden" name="requirements_confirmed" value="true" />
    <input type="hidden" name="return_path" value="/admin/asta" />
    <input type="hidden" name="only_auctionable" value={onlyAuctionable ? "1" : "0"} />
  </>;
}

function editSpaces(
  row: AuctionRow,
  rows: AuctionRow[],
  team: AuctionTeam | undefined,
  kind: "cut" | "free_release" | "slot",
  newSlot: AuctionSlot,
  contextualOperations: AppliedContextualSlotOperation[],
): [number, number, number] {
  if (!team || !row.roster) return [0, 0, 0];
  const { roster } = row;
  if (kind === "free_release") return team.spaces.map((space, index) => (
    space + (index === 0 && roster.slot === "dpe" ? 0 : roster.charges[index])
  )) as [number, number, number];
  if (kind === "cut") return [team.spaces[0] - (roster.slot === "dpe" ? roster.charges[0] : 0), team.spaces[1], team.spaces[2]];
  if (kind === "slot") {
    const after = [...team.spaces] as [number, number, number];
    if (roster.slot === "dpe") after[0] -= roster.charges[0];
    releaseFutureCapForSpecialSlot(after, roster, newSlot);
    for (const operation of contextualOperations) {
      const movedRoster = rows.find((item) => item.name === operation.playerName)?.roster;
      if (!movedRoster) continue;
      if (operation.kind === "free_release") {
        movedRoster.charges.forEach((charge, index) => { after[index] += charge; });
      } else if (operation.kind === "move") {
        releaseFutureCapForSpecialSlot(after, movedRoster, operation.destinationSlot);
      }
    }
    return after;
  }
  return team.spaces;
}

function releaseFutureCapForSpecialSlot(
  spaces: [number, number, number],
  roster: NonNullable<AuctionRow["roster"]>,
  destination: AuctionSlot,
) {
  if (destination === "regular" || roster.pendingAuctionContract || contractIncludesTeamOption(roster)) return;
  spaces[1] += roster.charges[1];
  spaces[2] += roster.charges[2];
}

function modificationDetails(
  row: AuctionRow,
  rows: AuctionRow[],
  kind: "cut" | "free_release" | "slot",
  newSlot: AuctionSlot,
  team: AuctionTeam | undefined,
  afterSpaces: [number, number, number],
  seasonName: string,
  contextualOperations: AppliedContextualSlotOperation[],
) {
  const roster = row.roster!;
  const lines = team ? afterSpaces.map((space, index) => `Cap libero ${seasonLabel(seasonName, index)}: ${team.spaces[index]} → ${space}`) : [];
  const currentEndYear = Number(seasonName.match(/\/(\d{2})$/)?.[1]);
  const exitContract = contractAfterRosterExit(roster.contract, currentEndYear);
  if (kind === "cut") return { title: `${row.name} sarà tagliato da ${roster.teamCode}`, lines: [`Il contratto da ${roster.cost} crediti continuerà a pesare fino alla scadenza ${exitContract}.`, ...lines] };
  const optionContract = annualTeamOptionContract(Number(seasonName.match(/\/(\d{2})$/)?.[1]));
  if (kind === "free_release") return {
    title: `${row.name} sarà rilasciato gratuitamente da ${roster.teamCode}`,
    lines: [
      `Resterà tra i tagliati a 0 crediti con scadenza ${exitContract}.`,
      ...lines,
    ],
  };
  const contextualLines = contextualOperations.flatMap((operation) => {
    const movedRoster = rows.find((item) => item.name === operation.playerName)?.roster;
    const normalizedContract = movedRoster ? contractAfterRosterExit(movedRoster.contract, currentEndYear) : null;
    if (operation.kind === "cut") {
      return [
        `Taglio contestuale: ${operation.playerName} da ${slotLabel(operation.sourceSlot)}`,
        ...(movedRoster && normalizedContract !== movedRoster.contract ? [`Contratto di ${operation.playerName}: ${movedRoster.contract} → ${normalizedContract}`] : []),
      ];
    }
    if (operation.kind === "free_release") {
      return [
        `Rilascio gratuito contestuale: ${operation.playerName} da ${slotLabel(operation.sourceSlot)}`,
        ...(movedRoster && normalizedContract !== movedRoster.contract ? [`Contratto di ${operation.playerName}: ${movedRoster.contract} → ${normalizedContract}`] : []),
      ];
    }
    return [
      `Spostamento contestuale: ${operation.playerName}, ${slotLabel(operation.sourceSlot)} → ${slotLabel(operation.destinationSlot)}`,
      ...(movedRoster && operation.destinationSlot !== "regular" && !movedRoster.pendingAuctionContract && !contractIncludesTeamOption(movedRoster)
        ? [`Contratto di ${operation.playerName}: ${movedRoster.contract} → ${optionContract}`]
        : []),
    ];
  });
  return {
    title: `${row.name}: ${slotLabel(roster.slot)} → ${slotLabel(newSlot)}`,
    lines: [
      ...contextualLines,
      ...(newSlot !== "regular" && !roster.pendingAuctionContract && !contractIncludesTeamOption(roster) ? [`Contratto di ${row.name}: ${roster.contract} → ${optionContract}`] : []),
      ...lines,
    ],
  };
}

function AuctionStatus({ row }: { row: AuctionRow }) {
  if (row.roster) return <span className="player-status player-status-roster">{row.roster.teamCode}</span>;
  if (row.qualifying) return <span className="player-status player-status-highlight"><strong>Q.O.</strong><small>{row.qualifying.teamCode}</small></span>;
  return <span className="player-status player-status-highlight"><strong>FA</strong></span>;
}

function ModalHeader({ row, label, onClose }: { row: AuctionRow; label: string; onClose: () => void }) {
  return <div className="auction-modal-header">
    <div><span>{label}</span><strong>{row.name}</strong><small className="real-team-text">{row.role} · {row.realTeam || "Squadra NBA non indicata"}</small></div>
    <button type="button" onClick={onClose} aria-label="Chiudi">×</button>
  </div>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`auction-field ${className}`.trim()}><span>{label}</span>{children}</label>;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function CutPlayerCheck({ names }: { names: string[] }) {
  return <p className="manual-cut-check">Verifica manualmente che il giocatore acquisito non compaia tra i tagliati:<br />{names.length ? names.join(" · ") : "nessun giocatore tagliato"}</p>;
}

function formatTeamName(name: string) {
  return name.toLocaleLowerCase("it-IT").replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("it-IT"));
}

function slotLabel(slot: "regular" | "two_way" | "g_league" | "dpe") {
  if (slot === "two_way") return "Two-way";
  if (slot === "g_league") return "G-League";
  if (slot === "dpe") return "DPE";
  return "Roster";
}

function seasonLabel(seasonName: string, distance: number) {
  const match = seasonName.match(/^(\d{4})\/(\d{2})$/);
  if (!match) return seasonName;
  const start = Number(match[1]) + distance;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

type DialogProps = {
  row: AuctionRow;
  rows: AuctionRow[];
  teams: AuctionTeam[];
  phase: string;
  seasonName: string;
  onlyAuctionable: boolean;
  onClose: () => void;
};
