"use client";

import { useEffect, useMemo, useState } from "react";
import { automaticFreeAgentContract, evaluateFreeAgentSigning } from "@/lib/rules/free-agent";
import { countRosterRoles } from "@/lib/rules/roster";
import { signFreeAgent } from "./actions";
import { CapBlocker } from "@/app/admin/cap-force-control";
import { isCapIssueCode } from "@/lib/cap-override";
import { roleMinimumRecoverySlotError } from "@/lib/role-minimums";
import { ContextualSlotResolver } from "@/app/admin/contextual-slot-resolver";
import { resolveContextualSlots, type ContextualSlotDecision } from "@/lib/contextual-slot-resolution";

type Slot = "regular" | "two_way" | "g_league" | "dpe";
type PlayerOption = {
  name: string;
  role: "G" | "A" | "C" | "X";
  listOrder: number;
  rosterTeamCode: string | null;
  qualifyingTeamCode: string | null;
  cutTeamCodes: string[];
  buyoutApplied: boolean;
};
type TeamOption = {
  code: string;
  name: string;
  currentCost: number;
  cutPlayerNames: string[];
  rosterPlayers: {
    name: string;
    role: "G" | "A" | "C" | null;
    slot: Slot;
    cost: number;
    contract: string;
    cuttable: boolean;
    moveDestinations: Exclude<Slot, "dpe">[];
  }[];
};

export function FreeAgentPanel({
  phase,
  enforceRoleMinimums,
  freeAgentThousandLimitApplies,
  seasonName,
  tradeDeadlinePassed,
  signAndTradeOpen,
  listPublished,
  teams,
  players,
}: {
  phase: "regular_season" | "closed";
  enforceRoleMinimums: boolean;
  freeAgentThousandLimitApplies: boolean;
  seasonName: string;
  tradeDeadlinePassed: boolean;
  signAndTradeOpen: boolean;
  listPublished: boolean;
  teams: TeamOption[];
  players: PlayerOption[];
}) {
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [outsideListOpen, setOutsideListOpen] = useState(false);
  const freeAgencyOpen = phase === "regular_season";
  const canSign = freeAgencyOpen && listPublished;
  const unavailableReason = !freeAgencyOpen ? "Free agency chiusa" : !listPublished ? "Listone ufficiale non pubblicato" : undefined;
  const freeAgents = useMemo(() => players.filter((player) => (
    !player.rosterTeamCode
    && !player.qualifyingTeamCode
    && player.name.toLocaleLowerCase("it-IT").includes(query.trim().toLocaleLowerCase("it-IT"))
  )), [players, query]);
  const selectedPlayer = players.find((player) => player.name === selectedName) ?? null;

  useEffect(() => {
    if (!selectedPlayer && !outsideListOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedName(null);
        setOutsideListOpen(false);
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [selectedPlayer, outsideListOpen]);

  return (
    <>
      <div className="free-agent-panel-toolbar">
        <label className="auction-search search-field">
          <span>Cerca</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome del giocatore…" />
        </label>
        <button className="button secondary" type="button" onClick={() => setOutsideListOpen(true)}>
          + Giocatore fuori listone
        </button>
      </div>

      <div className="auction-player-list free-agent-player-list">
        <div className="auction-player-head">
          <span>Giocatore</span><span>Ruolo</span><span>B.O.</span><span></span>
        </div>
        {freeAgents.map((player) => (
          <article className="auction-player-row" key={player.listOrder}>
            <span className="player-identity">
              <strong className="player-name">{player.name}</strong>
            </span>
            <span><i className={`mini-role mini-role-${player.role.toLowerCase()}`}>{player.role}</i></span>
            <span className="free-agent-buyout-cell">{player.buyoutApplied && <strong className="free-agent-buyout-mark" aria-label="Buyout applicato">X</strong>}</span>
            <button className="auction-row-action bid" type="button" onClick={() => setSelectedName(player.name)}>Firma</button>
          </article>
        ))}
        {!freeAgents.length && <div className="data-empty">{listPublished ? "Nessun free agent trovato" : "Listone non ancora pubblicato"}</div>}
      </div>

      {(selectedPlayer || outsideListOpen) && (
        <div className="auction-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setSelectedName(null);
            setOutsideListOpen(false);
          }
        }}>
          <FreeAgentDialog
            key={selectedPlayer?.name ?? "outside-list"}
            player={selectedPlayer}
            allPlayers={players}
            teams={teams}
            phase={phase}
            enforceRoleMinimums={enforceRoleMinimums}
            freeAgentThousandLimitApplies={freeAgentThousandLimitApplies}
            seasonName={seasonName}
            tradeDeadlinePassed={tradeDeadlinePassed}
            signAndTradeOpen={signAndTradeOpen}
            canSign={canSign}
            unavailableReason={unavailableReason}
            outsideList={outsideListOpen}
            onClose={() => {
              setSelectedName(null);
              setOutsideListOpen(false);
            }}
          />
        </div>
      )}
    </>
  );
}

function FreeAgentDialog({
  player,
  allPlayers,
  teams,
  phase,
  enforceRoleMinimums,
  freeAgentThousandLimitApplies,
  seasonName,
  tradeDeadlinePassed,
  signAndTradeOpen,
  canSign,
  unavailableReason,
  outsideList,
  onClose,
}: {
  player: PlayerOption | null;
  allPlayers: PlayerOption[];
  teams: TeamOption[];
  phase: string;
  enforceRoleMinimums: boolean;
  freeAgentThousandLimitApplies: boolean;
  seasonName: string;
  tradeDeadlinePassed: boolean;
  signAndTradeOpen: boolean;
  canSign: boolean;
  unavailableReason?: string;
  outsideList: boolean;
  onClose: () => void;
}) {
  const [teamCode, setTeamCode] = useState(teams[0]?.code ?? "");
  const [price, setPrice] = useState(1);
  const [destination, setDestination] = useState<"regular" | "two_way">("regular");
  const [slotDecisions, setSlotDecisions] = useState<ContextualSlotDecision[]>([]);
  const [outsideName, setOutsideName] = useState("");
  const [outsideRole, setOutsideRole] = useState<"G" | "A" | "C" | "X" | "">("");
  const [buyoutTopSixConfirmed, setBuyoutTopSixConfirmed] = useState(false);
  const [roleMinimumConfirmed, setRoleMinimumConfirmed] = useState(false);
  const [roleMinimumReplacement, setRoleMinimumReplacement] = useState(false);
  const team = teams.find((item) => item.code === teamCode) ?? teams[0];
  const slotResolutionPlayers = (team?.rosterPlayers ?? []).flatMap((item) => (
    item.slot === "dpe" ? [] : [{
      name: item.name,
      slot: item.slot,
      cuttable: item.cuttable,
      moveDestinations: item.moveDestinations,
    }]
  ));
  const customReady = outsideName.trim() && outsideRole;
  const selectedRole: "G" | "A" | "C" | null = player
    ? player.role === "X" ? null : player.role
    : outsideRole === "G" || outsideRole === "A" || outsideRole === "C" ? outsideRole : null;
  const slots = {
    regular: team?.rosterPlayers.filter((item) => item.slot === "regular").length ?? 0,
    twoWay: team?.rosterPlayers.filter((item) => item.slot === "two_way").length ?? 0,
    gLeague: team?.rosterPlayers.filter((item) => item.slot === "g_league").length ?? 0,
    dpe: team?.rosterPlayers.filter((item) => item.slot === "dpe").length ?? 0,
  };
  const roles = countRosterRoles(team?.rosterPlayers ?? []);
  const slotResolution = resolveContextualSlots({
    counts: { regular: slots.regular, two_way: slots.twoWay, g_league: slots.gLeague },
    incomingSlot: destination,
    players: slotResolutionPlayers,
    decisions: slotDecisions,
  });
  const contextualCutPlayers = slotResolution.operations.flatMap((operation) => {
    if (operation.kind !== "cut") return [];
    const cutPlayer = team?.rosterPlayers.find((item) => item.name === operation.playerName);
    return cutPlayer ? [cutPlayer] : [];
  });
  const contextualMoves = slotResolution.operations.flatMap((operation) => (
    operation.kind === "move" ? [operation] : []
  ));
  const outsideDuplicate = outsideList && allPlayers.some((item) => normalizeName(item.name) === normalizeName(outsideName));
  const preview = evaluateFreeAgentSigning({
    phase,
    enforceRoleMinimums,
    freeAgentThousandLimitApplies,
    currentCost: team?.currentCost ?? 0,
    price,
    destination,
    slots,
    playerSelected: outsideList ? Boolean(customReady) : Boolean(player),
    playerAlreadyOwned: Boolean(player?.rosterTeamCode),
    qualifyingOfferActive: Boolean(player?.qualifyingTeamCode),
    roles,
    playerRole: selectedRole,
    cutRole: null,
    cutSlot: null,
    contextualCuts: contextualCutPlayers.map((cutPlayer) => ({ role: cutPlayer.role, slot: cutPlayer.slot })),
    contextualMoves: contextualMoves.map((move) => ({
      sourceSlot: move.sourceSlot,
      destinationSlot: move.destinationSlot,
    })),
  });
  const slotBefore = destination === "regular" ? slots.regular : slots.twoWay;
  const slotAfter = destination === "regular" ? preview.calculated.slotsAfter.regular : preview.calculated.slotsAfter.twoWay;
  const slotLimit = destination === "regular" ? 15 : 2;
  const capWarnings = preview.warnings.filter((warning) => isCapIssueCode(warning.code));
  const otherWarnings = preview.warnings.filter((warning) => !isCapIssueCode(warning.code));
  const roleMinimumConfirmationRequired = otherWarnings.some((warning) => warning.code.startsWith("ROLE_"));
  const roleMinimumShortageBefore = {
    G: Math.max(0, 5 - roles.G),
    A: Math.max(0, 5 - roles.A),
    C: Math.max(0, 3 - roles.C),
  };
  const roleMinimumShortageAfter = {
    G: Math.max(0, 5 - preview.calculated.rolesAfter.G),
    A: Math.max(0, 5 - preview.calculated.rolesAfter.A),
    C: Math.max(0, 3 - preview.calculated.rolesAfter.C),
  };
  const roleMinimumReplacementAvailable = enforceRoleMinimums
    && price === 1
    && Boolean(player)
    && Boolean(selectedRole)
    && roleMinimumShortageBefore[selectedRole as "G" | "A" | "C"] > 0;
  const blockingCapWarnings = roleMinimumReplacement && roleMinimumReplacementAvailable ? [] : capWarnings;
  const contract = automaticFreeAgentContract(seasonName, tradeDeadlinePassed || roleMinimumReplacement) ?? "—";
  const roleMinimumSlotError = roleMinimumConfirmationRequired
    ? roleMinimumRecoverySlotError({ ...roleMinimumShortageAfter, total: roleMinimumShortageAfter.G + roleMinimumShortageAfter.A + roleMinimumShortageAfter.C }, {
      regular: preview.calculated.slotsAfter.regular,
      twoWay: preview.calculated.slotsAfter.twoWay,
    })
    : null;
  const roleMinimumConfirmationMissing = roleMinimumConfirmationRequired && !roleMinimumConfirmed;
  const signAndTradeErrors = preview.errors.filter((error) => !error.code.startsWith("SLOT_"));
  const buyoutEligibilityConfirmationMissing = Boolean(player?.buyoutApplied) && !buyoutTopSixConfirmed;

  function openSignAndTrade() {
    const params = new URLSearchParams({
      sign_kind: "free_agent",
      sign_source: outsideList ? "outside" : "list",
      sign_player: outsideList ? outsideName.trim() : player?.name ?? "",
      sign_role: outsideList ? outsideRole : "",
      sign_real_team: outsideList ? "FA" : "",
      sign_team: teamCode,
      sign_price: String(price),
      sign_slot: destination,
      sign_buyout_top_six_confirmed: String(buyoutTopSixConfirmed),
    });
    window.location.assign(`/admin/scambi?${params.toString()}`);
  }

  return (
    <form action={signFreeAgent} className="auction-modal" onSubmit={(event) => { if (!canSign) event.preventDefault(); }} role="dialog" aria-modal="true" aria-label={`Firma ${(player?.name ?? outsideName) || "giocatore fuori listone"}`}>
      <input type="hidden" name="player_source" value={outsideList ? "outside" : "list"} />
      <input type="hidden" name="player_name" value={outsideList ? outsideName.trim() : player?.name ?? ""} />
      <input type="hidden" name="player_role" value={outsideList ? outsideRole : ""} />
      <input type="hidden" name="real_team" value={outsideList ? "FA" : ""} />
      <input type="hidden" name="team_code" value={teamCode} />
      <input type="hidden" name="price" value={price} />
      <input type="hidden" name="destination" value={destination} />
      <input type="hidden" name="slot_resolution_json" value={JSON.stringify(slotDecisions)} />
      <input type="hidden" name="buyout_top_six_confirmed" value={String(buyoutTopSixConfirmed)} />
      <input type="hidden" name="role_minimum_confirmed" value={String(roleMinimumConfirmed)} />
      <input type="hidden" name="role_minimum_replacement" value={String(roleMinimumReplacement)} />

      <div className="auction-modal-header">
        <div>
          <span>Firma free agent</span>
          <strong>{(player?.name ?? outsideName.trim()) || "Giocatore fuori listone"}</strong>
          <small>{player ? player.role : "Inserimento contestuale nel listone"}</small>
        </div>
        <button type="button" onClick={onClose} aria-label="Chiudi">×</button>
      </div>

      <div className="auction-modal-body">
        {!canSign && <p className="validation error free-agent-window-closed"><strong>{unavailableReason ?? "Operazione non disponibile"}.</strong> Puoi consultare e compilare questa finestra, ma non confermare l’operazione.</p>}
        <div className={`auction-modal-fields free-agent-signing-fields ${outsideList ? "free-agent-outside-fields" : ""}`}>
          {outsideList && (
            <>
              <Field label="Nome giocatore" className="field-player-name"><input type="text" maxLength={120} value={outsideName} onChange={(event) => { setOutsideName(event.target.value); setBuyoutTopSixConfirmed(false); }} /></Field>
              <Field label="Ruolo" className="field-player-role"><select value={outsideRole} onChange={(event) => { setOutsideRole(event.target.value as typeof outsideRole); setRoleMinimumConfirmed(false); setRoleMinimumReplacement(false); }}><option value="">Seleziona</option><option value="G">Guardia</option><option value="A">Ala</option><option value="C">Centro</option><option value="X">Senza ruolo Dunkest</option></select></Field>
            </>
          )}
          <Field label="Squadra" className="field-team">
            <select value={teamCode} onChange={(event) => { setTeamCode(event.target.value); setSlotDecisions([]); setBuyoutTopSixConfirmed(false); setRoleMinimumConfirmed(false); setRoleMinimumReplacement(false); }}>
              {teams.map((item) => <option value={item.code} key={item.code}>{formatTeamName(item.name)}</option>)}
            </select>
          </Field>
          <Field label="Prezzo" className="field-price"><input type="number" min="1" step="1" inputMode="numeric" value={price} onChange={(event) => { const value = Number(event.target.value); setPrice(value); setRoleMinimumConfirmed(false); if (value !== 1) setRoleMinimumReplacement(false); if (value > 10 && destination !== "regular") { setDestination("regular"); setSlotDecisions([]); } }} /></Field>
          <Field label="Slot" className="field-slot">
            <select value={destination} onChange={(event) => { setDestination(event.target.value as typeof destination); setSlotDecisions([]); setRoleMinimumConfirmed(false); }}>
              <option value="regular">Roster</option>
              <option value="two_way" disabled={price > 10}>Two-way</option>
            </select>
          </Field>
        </div>

        <ContextualSlotResolver
          counts={{ regular: slots.regular, two_way: slots.twoWay, g_league: slots.gLeague }}
          incomingSlot={destination}
          players={slotResolutionPlayers}
          value={slotDecisions}
          onChange={(next) => { setSlotDecisions(next); setRoleMinimumConfirmed(false); }}
        />

        <div className="auction-modal-summary free-agent-modal-summary">
          <Metric label="Spazio libero" value={`${preview.calculated.spaceBefore} → ${preview.calculated.spaceAfter}`} />
          <Metric label={destination === "regular" ? "Slot roster" : "Slot Two-way"} value={`${slotBefore}/${slotLimit} → ${slotAfter}/${slotLimit}`} />
          <Metric label="Ruoli" value={`${formatRoles(roles)} → ${formatRoles(preview.calculated.rolesAfter)}`} />
          <Metric label="Contratto" value={contract} />
        </div>
        <p className="manual-cut-check">Verifica manualmente che il giocatore acquisito non compaia tra i tagliati:<br />{team?.cutPlayerNames.length ? team.cutPlayerNames.join(" · ") : "nessun giocatore tagliato"}</p>
        {outsideDuplicate && <p className="validation error">Il giocatore è già nel listone: selezionalo dall’elenco.</p>}
        {player?.buyoutApplied && (
          <label className="operation-check free-agent-standing-check">
            <input type="checkbox" checked={buyoutTopSixConfirmed} onChange={(event) => setBuyoutTopSixConfirmed(event.target.checked)} />
            Ho verificato che la squadra occupi una delle prime sei posizioni della regular season
          </label>
        )}
        {roleMinimumReplacementAvailable && (
          <label className="operation-check role-minimum-check">
            <input type="checkbox" checked={roleMinimumReplacement} onChange={(event) => { setRoleMinimumReplacement(event.target.checked); setRoleMinimumConfirmed(false); }} />
            Questo free agent è assegnato per coprire la carenza di ruolo: contratto annuale senza Q.O. (1 credito)
          </label>
        )}
        {roleMinimumReplacement && roleMinimumReplacementAvailable && capWarnings.length > 0 && (
          <p className="validation warning">L’assegnazione obbligatoria da 1 credito può superare il salary cap; il credito continua comunque a pesare sul cap della squadra.</p>
        )}
        {roleMinimumSlotError && <p className="validation error">{roleMinimumSlotError}</p>}
        {roleMinimumConfirmationRequired && !roleMinimumSlotError && (
          <label className="operation-check role-minimum-check">
            <input type="checkbox" checked={roleMinimumConfirmed} onChange={(event) => setRoleMinimumConfirmed(event.target.checked)} />
            Confermo che assegnerò in seguito i free agent casuali da 1 credito necessari per ripristinare i ruoli.
          </label>
        )}
        {preview.errors.filter((error) => canSign || error.code !== "FREE_AGENCY_CLOSED").map((error) => <p className="validation error" key={error.code}>{error.message}</p>)}
        {signAndTradeOpen && slotResolution.steps.length > 0 && signAndTradeErrors.length === 0 && (
          <p className="validation warning">Per Firma e scambia questa sequenza non viene applicata: gli slot devono risultare regolari alla fine dello scambio.</p>
        )}
        {otherWarnings.map((warning) => <p className="validation warning" key={warning.code}>{warning.message}</p>)}
        <CapBlocker warnings={blockingCapWarnings.map((warning) => warning.message)} />
      </div>

      <div className="auction-modal-actions">
        <button className="button secondary" type="button" onClick={onClose}>Annulla</button>
        <button
          className="button secondary sign-trade-action"
          type="button"
          onClick={openSignAndTrade}
          disabled={!canSign || !signAndTradeOpen || signAndTradeErrors.length > 0 || buyoutEligibilityConfirmationMissing || outsideDuplicate || !team}
        >
          Firma e scambia
        </button>
        <button className="button primary" type="submit" disabled={!canSign || !preview.valid || !slotResolution.complete || slotResolution.errors.length > 0 || buyoutEligibilityConfirmationMissing || roleMinimumConfirmationMissing || roleMinimumSlotError !== null || outsideDuplicate || !team || blockingCapWarnings.length > 0}>Registra firma</button>
      </div>
    </form>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`auction-field ${className}`.trim()}><span>{label}</span>{children}</label>;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}

function formatTeamName(name: string) {
  return name.toLocaleLowerCase("it-IT").replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("it-IT"));
}

function formatRoles(roles: { G: number; A: number; C: number }) {
  return `${roles.G} G · ${roles.A} A · ${roles.C} C`;
}
