"use client";

import { useMemo, useState } from "react";
import { applyDpeOperation } from "@/app/admin/dpe/actions";
import { applyContractExtension } from "@/app/admin/estensioni/actions";
import { applyRosterExitOperation, applyStretchProvision } from "@/app/admin/tagli-rilasci/actions";
import type { AdminOperationContext, AdminRosterPlayer, AdminRosterTeam } from "@/lib/admin-operation-data";
import type { LeaguePhase, RosterEntry } from "@/lib/league-types";
import { releaseCapSpaces, stretchCapSpaces, type ThreeYearValues } from "@/lib/release-operations";
import { calculateCapSpace } from "@/lib/season-time";
import { canApplyStretchProvision } from "@/lib/stretch-provision";
import { operationWindows, type LeagueMoment } from "@/lib/league-moments";
import { CapBlocker } from "@/app/admin/cap-force-control";
import { hasBlockingDpeCutCapViolation, salaryCapWarningsForSpaces } from "@/lib/cap-override";
import {
  availableFreeReleaseReasons,
  freeReleaseReasonAvailability,
  hadDpeInPreviousSeason,
  freeReleaseReasonLabels,
  freeReleaseReasonValues,
  type FreeReleaseReason,
} from "@/lib/free-release";
import { isUnresolvedTeamOption } from "@/lib/team-option-contract";
import { dpeCountsForRoleMinimums, roleMinimumChecksApply } from "@/lib/role-minimums";
import { applyScheduledSeasonEndCut } from "@/app/admin/tagli-programmati/actions";
import { roleMinimumDeficits, roleMinimums } from "@/lib/rules/roster";

type Slot = "regular" | "two_way" | "g_league" | "dpe";
type Operation = "extension" | "cut" | "free_release" | "buyout" | "stretch" | "dpe_activate" | "dpe_reintegrate" | "schedule_cut" | "cancel_scheduled_cut";
type OperationChoice = { value: Operation; label: string };

const groups: { key: Slot | "cut"; label: string; limit?: number }[] = [
  { key: "regular", label: "Roster", limit: 15 },
  { key: "two_way", label: "Two-way", limit: 2 },
  { key: "g_league", label: "G-League", limit: 3 },
  { key: "dpe", label: "Disabled player exception", limit: 1 },
  { key: "cut", label: "Tagliati" },
];

export function OtherOperationsPanel(props: AdminOperationContext) {
  const [teamCode, setTeamCode] = useState(props.teams[0]?.code ?? "");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const team = props.teams.find((item) => item.code === teamCode) ?? props.teams[0];
  const selectedPlayer = team?.players.find((player) => player.id === selectedPlayerId) ?? null;
  return (
    <>
      <label className="admin-team-select other-operations-team-select">
        <span>Squadra</span>
        <select value={teamCode} onChange={(event) => { setTeamCode(event.target.value); setSelectedPlayerId(null); }}>
          {props.teams.map((item) => <option value={item.code} key={item.code}>{formatTeamName(item.name)}</option>)}
        </select>
      </label>

      {team && (
        <div className="team-accordion-content other-operations-content">
          {groups.map((group) => {
            const rows = team.players
              .filter((player) => placementOf(player) === group.key)
              .sort((left, right) => right.cost - left.cost || left.name.localeCompare(right.name, "it"));
            return (
              <section className="accordion-data-section other-operations-section" key={group.key}>
                <p>{group.label}{group.limit ? ` (${rows.length}/${group.limit})` : ""}</p>
                <div className="other-operations-table">
                  <div className="other-operations-head"><span>Giocatore</span><span>{group.key === "cut" ? "Stretch" : "Ruolo"}</span><span>Scadenza</span><span>Costo</span><span></span></div>
                  {rows.map((player) => {
                    const choices = availableOperations(player, team, props);
                    return (
                      <div className="other-operations-row" key={player.id}>
                        <strong>{player.name}</strong>
                        <span>{group.key === "cut" ? player.stretchProvisionApplied || player.buyoutApplied ? "X" : "—" : player.role ?? "X"}</span>
                        <span>{player.contract}</span>
                        <span>{player.cost}</span>
                        <button type="button" disabled={!choices.length} onClick={() => setSelectedPlayerId(player.id)}>Operazioni</button>
                      </div>
                    );
                  })}
                  {!rows.length && <div className="data-empty">—</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {team && selectedPlayer && (
        <div className="auction-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedPlayerId(null);
        }}>
          <OperationDialog
            key={selectedPlayer.id}
            player={selectedPlayer}
            team={team}
            props={props}
            onClose={() => setSelectedPlayerId(null)}
          />
        </div>
      )}
    </>
  );
}

function OperationDialog({ player, team, props, onClose }: { player: AdminRosterPlayer; team: AdminRosterTeam; props: AdminOperationContext; onClose: () => void }) {
  const choices = useMemo(() => availableOperations(player, team, props), [player, team, props]);
  const [operation, setOperation] = useState<Operation>(choices[0]?.value ?? "cut");
  const [confirmed, setConfirmed] = useState(false);
  const [roleMinimumConfirmed, setRoleMinimumConfirmed] = useState(false);
  const [installments, setInstallments] = useState<2 | 3>(2);
  const [releaseReason, setReleaseReason] = useState<FreeReleaseReason | "">("");
  const oneCreditTeamOptionRelease = operation === "free_release"
    && freeReleaseReasonAvailability("one_credit_team_option", props.leagueMoment, player, props.seasonName).available;
  const preview = operationPreview(operation, player, team, props, installments, confirmed, roleMinimumConfirmed, releaseReason);
  const formAction = operation === "extension"
    ? applyContractExtension
    : operation === "stretch"
      ? applyStretchProvision
      : operation === "dpe_activate" || operation === "dpe_reintegrate"
        ? applyDpeOperation
        : operation === "schedule_cut" || operation === "cancel_scheduled_cut"
          ? applyScheduledSeasonEndCut
        : applyRosterExitOperation;

  return (
    <form action={formAction} className="auction-modal other-operation-modal" role="dialog" aria-modal="true" aria-label={`Operazioni per ${player.name}`}>
      <input type="hidden" name="return_path" value="/admin/altre-operazioni" />
      <input type="hidden" name="team_code" value={team.code} />
      <input type="hidden" name="player_name" value={player.name} />
      <input type="hidden" name="operation_kind" value={operation} />
      <input type="hidden" name="dpe_operation" value={operation} />
      <input type="hidden" name="scheduled_cut_operation" value={operation === "schedule_cut" ? "schedule" : operation === "cancel_scheduled_cut" ? "cancel" : ""} />
      <input type="hidden" name="requirements_confirmed" value={String(confirmed)} />
      <input type="hidden" name="role_minimum_confirmed" value={String(roleMinimumConfirmed)} />
      <input type="hidden" name="confirmed" value={String(confirmed)} />
      <input type="hidden" name="installments" value={installments} />

      <div className="auction-modal-header">
        <div><span>Altre operazioni</span><strong>{player.name}</strong><small>{placementLabel(player)} · {player.contract} · {player.cost}</small></div>
        <button type="button" onClick={onClose} aria-label="Chiudi">×</button>
      </div>

      <div className="auction-modal-body">
        <div className="auction-modal-fields single-column">
          <Field label="Operazione">
            <select value={operation} onChange={(event) => { setOperation(event.target.value as Operation); setConfirmed(false); setRoleMinimumConfirmed(false); setReleaseReason(""); }}>
              {choices.map((choice) => <option value={choice.value} key={choice.value}>{choice.label}</option>)}
            </select>
          </Field>
          {operation === "stretch" && (
            <Field label="Numero di rate"><select value={installments} onChange={(event) => { setInstallments(Number(event.target.value) as 2 | 3); }}><option value={2}>2 rate</option><option value={3}>3 rate</option></select></Field>
          )}
          {operation === "free_release" && !oneCreditTeamOptionRelease && (
            <div className="release-reason-fieldset">
              <span>Causa del rilascio</span>
              <div className="release-reason-list">
                {freeReleaseReasonValues.filter((reason) => reason !== "one_credit_team_option"
                  && !(reason === "under_half_games" && hadDpeInPreviousSeason(player, props.seasonName))).map((reason) => {
                  const availability = freeReleaseReasonAvailability(reason, props.leagueMoment, player, props.seasonName);
                  return (
                    <label className={availability.available ? "" : "disabled"} key={reason}>
                      <input
                        type="checkbox"
                        name="release_reason"
                        value={reason}
                        checked={releaseReason === reason}
                        disabled={!availability.available}
                        onChange={(event) => setReleaseReason(event.target.checked ? reason : "")}
                      />
                      <span>{freeReleaseReasonLabels[reason]}{availability.unavailableReason && <small>{availability.unavailableReason}</small>}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          {requiresConfirmation(operation) && (
            <label className="operation-check other-operation-check">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              {confirmationLabel(operation)}
            </label>
          )}
          {preview.roleMinimumMissing > 0 && !preview.roleMinimumSlotError && (
            <label className="operation-check other-operation-check role-minimum-check">
              <input type="checkbox" checked={roleMinimumConfirmed} onChange={(event) => setRoleMinimumConfirmed(event.target.checked)} />
              Confermo che assegnerò in seguito i free agent casuali da 1 credito necessari per ripristinare i ruoli.
            </label>
          )}
        </div>

        <div className="auction-modal-summary cap-three-years">
          {preview.spacesAfter.map((space, index) => <Metric label={`Cap libero ${seasonNameAt(props.seasonName, index)}`} value={`${preview.spacesBefore[index]} → ${space}`} key={index} />)}
        </div>
        <div className="auction-modal-summary other-operation-summary">
          <Metric label="Slot" value={`${formatSlots(preview.slotsBefore)} → ${formatSlots(preview.slotsAfter)}`} />
          <Metric label="Ruoli" value={`${formatRoles(preview.rolesBefore)} → ${formatRoles(preview.rolesAfter)}`} />
          {(operation === "schedule_cut" || operation === "cancel_scheduled_cut") && (
            <Metric
              label="Roster a Fine stagione"
              value={`${team.seasonEndProjectedRegularSlotsAfterScheduledCuts} → ${team.seasonEndProjectedRegularSlotsAfterScheduledCuts + (operation === "schedule_cut" ? -1 : player.seasonEndCutEligible ? 1 : 0)}/15`}
            />
          )}
          {operation === "extension" && <Metric label="Nuovo contratto" value={`${props.seasonEndYear + 1} · ${Math.ceil(player.cost * 1.25)}`} />}
          {operation === "buyout" && <Metric label="Nuovo contratto" value={`${String(props.seasonEndYear).slice(-2)} · ${preview.buyoutTotalResidual}`} />}
          {operation === "stretch" && <Metric label="Rata" value={preview.installment ?? "—"} />}
        </div>
        {preview.errors.map((error) => <p className="validation error" key={error}>{error}</p>)}
        {preview.warnings.map((warning) => <p className="validation warning" key={warning}>{warning}</p>)}
        {operation === "schedule_cut" && <p className="validation warning">Il giocatore resta attivo nello slot attuale. Il taglio sarà eseguito automaticamente con l’avanzamento a Fine stagione.</p>}
        {operation === "cancel_scheduled_cut" && <p className="validation warning">Il giocatore non sarà più tagliato automaticamente a Fine stagione.</p>}
        <CapBlocker warnings={preview.capWarnings} />
      </div>

      <div className="auction-modal-actions">
        <button className="button secondary" type="button" onClick={onClose}>Annulla</button>
        <button className="button primary" type="submit" disabled={preview.errors.length > 0 || preview.capWarnings.length > 0}>{operation === "schedule_cut" ? "Programma taglio" : operation === "cancel_scheduled_cut" ? "Annulla programmazione" : "Registra operazione"}</button>
      </div>
    </form>
  );
}

function availableOperations(player: AdminRosterPlayer, team: AdminRosterTeam, props: AdminOperationContext): OperationChoice[] {
  const choices: OperationChoice[] = [];
  const slots = slotCounts(team);
  const unresolvedTeamOption = isUnresolvedTeamOption(player, props.leagueMoment, props.seasonName);
  if (player.state === "active" && player.isExtensionEligible && player.expiryYear === props.seasonEndYear && operationWindows.extensions(props.leagueMoment)) choices.push({ value: "extension", label: "Estensione contrattuale" });
  if (player.state === "active" && !unresolvedTeamOption) choices.push({ value: "cut", label: "Taglio" });
  if (operationWindows.scheduledCut(props.leagueMoment) && player.scheduledSeasonEndCut) {
    choices.push({ value: "cancel_scheduled_cut", label: "Annulla taglio programmato" });
  } else if (
    operationWindows.scheduledCut(props.leagueMoment)
    && player.state === "active"
    && player.seasonEndCutEligible
    && team.seasonEndRemainingOverflow > 0
  ) {
    choices.push({ value: "schedule_cut", label: "Taglio programmato" });
  }
  if (!unresolvedTeamOption && availableFreeReleaseReasons(props.leagueMoment, player, props.seasonName).length) choices.push({ value: "free_release", label: "Rilascio gratuito" });
  if (player.state === "active" && operationWindows.buyout(props.leagueMoment) && player.expiryYear && player.expiryYear > props.seasonEndYear) choices.push({ value: "buyout", label: "Buyout" });
  if (canApplyStretchProvision(player, props.seasonEndYear)) choices.push({ value: "stretch", label: "Stretch provision" });
  if (player.state === "active" && !unresolvedTeamOption && player.slot !== "dpe" && slots.dpe < 1 && operationWindows.dpeActivation(props.leagueMoment)) choices.push({ value: "dpe_activate", label: "Esercita DPE" });
  if (player.state === "active" && !unresolvedTeamOption && player.slot === "dpe" && operationWindows.dpeReintegration(props.leagueMoment)) choices.push({ value: "dpe_reintegrate", label: "Reintegro anticipato dalla DPE" });
  return choices;
}

function operationPreview(
  operation: Operation,
  player: AdminRosterPlayer,
  team: AdminRosterTeam,
  props: AdminOperationContext,
  installments: 2 | 3,
  confirmed: boolean,
  roleMinimumConfirmed: boolean,
  releaseReason: FreeReleaseReason | "",
) {
  const spacesBefore: ThreeYearValues = [team.space, team.nextSpace, team.followingSpace];
  const charges = playerCharges(player, props);
  const buyoutTotalResidual = charges.reduce((total, charge) => total + charge, 0);
  let spacesAfter: ThreeYearValues = [...spacesBefore];
  let installment: number | undefined;
  if (operation === "extension") {
    const newCost = Math.ceil(player.cost * 1.25);
    spacesAfter = [0, 1, 2].map((index) => {
      const targetEndYear = props.seasonEndYear + index;
      const excludedByCurrentDpe = index === 0 && player.slot === "dpe";
      const oldCost = !excludedByCurrentDpe && targetEndYear <= (player.expiryYear ?? 0) ? player.cost : 0;
      const extendedCost = !excludedByCurrentDpe && targetEndYear <= (player.expiryYear ?? 0) + 1 ? newCost : 0;
      return spacesBefore[index] + oldCost - extendedCost;
    }) as ThreeYearValues;
  } else if (["cut", "free_release", "buyout"].includes(operation)) {
    spacesAfter = releaseCapSpaces({
      kind: operation as "cut" | "free_release" | "buyout",
      spacesBefore,
      contractCharges: charges,
      currentDpeExemption: player.state === "active" && player.slot === "dpe",
    });
  } else if (operation === "stretch") {
    const stretch = stretchCapSpaces(spacesBefore, charges[0], installments);
    spacesAfter = stretch.spacesAfter;
    installment = stretch.installment;
  } else if (operation === "dpe_activate") {
    spacesAfter = [spacesBefore[0] + player.currentCapCost, spacesBefore[1], spacesBefore[2]];
  } else if (operation === "dpe_reintegrate") {
    spacesAfter = [spacesBefore[0] - player.currentCapCost, spacesBefore[1], spacesBefore[2]];
  }

  const slotsBefore = slotCounts(team);
  const rolesBefore = roleCounts(team, props.leagueMoment);
  const slotsAfter = { ...slotsBefore };
  const rolesAfter = { ...rolesBefore };
  if (["cut", "free_release", "buyout"].includes(operation) && player.state === "active") {
    slotsAfter[player.slot] -= 1;
    if ((player.slot !== "dpe" || dpeCountsForRoleMinimums(props.leagueMoment)) && player.role) rolesAfter[player.role] -= 1;
  }
  if (operation === "dpe_activate") {
    slotsAfter[player.slot] -= 1;
    slotsAfter.dpe += 1;
    if (player.role) rolesAfter[player.role] -= 1;
  }
  if (operation === "dpe_reintegrate") {
    slotsAfter.dpe -= 1;
    slotsAfter.regular += 1;
    if (player.role) rolesAfter[player.role] += 1;
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const capWarnings: string[] = [];
  if (requiresConfirmation(operation) && !confirmed) errors.push("Conferma i requisiti regolamentari richiesti.");
  if (operation === "free_release") {
    const automaticOneCreditRelease = freeReleaseReasonAvailability("one_credit_team_option", props.leagueMoment, player, props.seasonName).available;
    if (!automaticOneCreditRelease) {
      if (!releaseReason) errors.push("Seleziona una e una sola causa di rilascio gratuito.");
      else {
        const availability = freeReleaseReasonAvailability(releaseReason, props.leagueMoment, player, props.seasonName);
        if (!availability.available) errors.push(availability.unavailableReason ?? "Questa causa di rilascio non è disponibile.");
      }
    }
  }
  if (operation === "extension") {
    spacesAfter.forEach((space, index) => {
      if (index > 0 && space < 0) capWarnings.push(`L'estensione porta il cap libero ${seasonNameAt(props.seasonName, index)} a ${space}.`);
      if (index === 0 && space < 0 && space < spacesBefore[0]) capWarnings.push(`L'estensione porta il cap libero ${props.seasonName} a ${space}.`);
    });
  } else {
    const calculatedCapWarnings = salaryCapWarningsForSpaces({
      before: spacesBefore,
      after: spacesAfter,
      seasonNames: [0, 1, 2].map((index) => seasonNameAt(props.seasonName, index)),
      phase: props.phase,
      currentMoment: props.leagueMoment,
      currentLimit: operation === "buyout" ? 1000 : undefined,
    });
    if (hasBlockingDpeCutCapViolation(operation === "cut" && player.slot === "dpe", calculatedCapWarnings)) {
      errors.push(...calculatedCapWarnings.map((warning) => `Taglio dalla DPE non consentito: ${warning}`));
    } else {
      capWarnings.push(...calculatedCapWarnings);
    }
  }
  if (slotsAfter.regular > 15) errors.push("Sono superati i 15 slot roster.");
  if (slotsAfter.two_way > 2) errors.push("Sono superati i 2 slot Two-way.");
  if (slotsAfter.g_league > 3) errors.push("Sono superati i 3 slot G-League.");
  let roleMinimumMissing = 0;
  if (slotsAfter.dpe > 1) errors.push("Lo slot DPE è già occupato.");
  if (roleMinimumChecksApply(props.phase as LeaguePhase, props.leagueMoment) && ["cut", "free_release", "buyout", "dpe_activate", "dpe_reintegrate"].includes(operation)) {
    const missingRoles = roleMinimumDeficits(rolesAfter);
    for (const role of ["G", "A", "C"] as const) {
      roleMinimumMissing += missingRoles[role];
      if (missingRoles[role] > 0) warnings.push(
        `Dopo l'operazione restano ${rolesAfter[role]}/${roleMinimums[role]} giocatori di ruolo ${role}: sarà necessaria l'assegnazione casuale prevista dall'Art. 2(c).`,
      );
    }
  }
  const freeRoleRecoverySlots = Math.max(0, 15 - slotsAfter.regular) + Math.max(0, 2 - slotsAfter.two_way);
  const roleMinimumSlotError = roleMinimumMissing > 0
    && roleMinimumMissing > freeRoleRecoverySlots
    ? `Servono ${roleMinimumMissing} slot tra roster e Two-way per ripristinare i minimi di ruolo, ma ne restano ${freeRoleRecoverySlots}.`
    : null;
  if (roleMinimumSlotError) errors.push(roleMinimumSlotError);
  if (roleMinimumMissing > 0 && !roleMinimumSlotError && !roleMinimumConfirmed) errors.push("Conferma il ripristino obbligatorio dei minimi di ruolo.");
  return {
    spacesBefore,
    spacesAfter,
    slotsBefore,
    slotsAfter,
    rolesBefore,
    rolesAfter,
    roleMinimumMissing,
    roleMinimumSlotError,
    installment,
    buyoutTotalResidual,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    capWarnings: [...new Set(capWarnings)],
  };
}

function playerCharges(player: AdminRosterPlayer, props: AdminOperationContext): ThreeYearValues {
  return entryCharges(rosterEntryForPlayer(player), props);
}

function rosterEntryForPlayer(player: AdminRosterPlayer): RosterEntry {
  return {
    name: player.name,
    cost: player.cost,
    contract: player.contract,
    role: player.role ?? undefined,
    state: player.state,
    slot: player.slot,
    teamCode: "",
    stretchProvisionApplied: player.stretchProvisionApplied,
    buyoutApplied: player.buyoutApplied,
    teamOptionBaseCost: player.teamOptionBaseCost,
    teamOptionFinalYear: player.teamOptionFinalYear,
    contractStartSeason: player.contractStartSeason,
    twoWayPromotionLocked: player.twoWayPromotionLocked,
    playoffTeamOptionPromotionSeason: player.playoffTeamOptionPromotionSeason,
    freeAgentSignedSeason: player.freeAgentSignedSeason,
    endedPreviousSeasonInGLeague: player.endedPreviousSeasonInGLeague,
  };
}

function entryCharges(entry: RosterEntry, props: AdminOperationContext): ThreeYearValues {
  const countTeamOptions = props.phase !== "offseason" || props.teamOptionsResolved;
  return [0, 1, 2].map((distance) => 1000 - calculateCapSpace({ entries: [entry], seasonName: seasonNameAt(props.seasonName, distance), optionSeasonName: props.seasonName, countTeamOptions })) as ThreeYearValues;
}

function slotCounts(team: AdminRosterTeam) {
  return team.players.filter((player) => player.state === "active").reduce<Record<Slot, number>>((counts, player) => { counts[player.slot] += 1; return counts; }, { regular: 0, two_way: 0, g_league: 0, dpe: 0 });
}

function roleCounts(team: AdminRosterTeam, leagueMoment?: LeagueMoment) {
  return team.players.filter((player) => (
    player.state === "active" && (player.slot !== "dpe" || dpeCountsForRoleMinimums(leagueMoment))
  )).reduce((counts, player) => { if (player.role) counts[player.role] += 1; return counts; }, { G: 0, A: 0, C: 0 });
}

function requiresConfirmation(operation: Operation) {
  return operation === "buyout"
    || operation === "dpe_activate"
    || operation === "dpe_reintegrate";
}

function confirmationLabel(operation: Operation) {
  if (operation === "buyout") return "Il buyout è stato concordato con il giocatore";
  if (operation === "dpe_activate") return "Ho verificato che NBC Sports riporti la certezza o il forte rischio dell'assenza per infortunio e che sia raggiunta la soglia regolamentare";
  if (operation === "dpe_reintegrate") return "Ho verificato il ritorno in campo NBA e il rispetto dei dieci giorni dal rientro";
  return "Sono verificati i requisiti richiesti";
}

function placementOf(player: AdminRosterPlayer): Slot | "cut" { return player.state === "cut" ? "cut" : player.slot; }
function placementLabel(player: AdminRosterPlayer) { return player.state === "cut" ? "Tagliato" : slotLabel(player.slot); }
function slotLabel(slot: Slot) { return slot === "regular" ? "Roster" : slot === "two_way" ? "Two-way" : slot === "g_league" ? "G-League" : "DPE"; }
function formatSlots(slots: Record<Slot, number>) { return `${slots.regular}/15 · ${slots.two_way}/2 · ${slots.g_league}/3 · ${slots.dpe}/1`; }
function formatRoles(roles: Record<"G" | "A" | "C", number>) { return `${roles.G} G · ${roles.A} A · ${roles.C} C`; }
function seasonNameAt(name: string, distance: number) { const start = Number(name.slice(0, 4)) + distance; return `${start}/${String((start + 1) % 100).padStart(2, "0")}`; }
function formatTeamName(name: string) { return name.toLocaleLowerCase("it-IT").replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("it-IT")); }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="auction-field"><span>{label}</span>{children}</label>; }
function Metric({ label, value }: { label: string; value: React.ReactNode }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
