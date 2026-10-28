"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RosterEntry } from "@/lib/league-types";
import { loadEditableLeagueState } from "@/lib/league-state";
import { persistLeagueMovement } from "@/lib/league-movements";
import { rosterAfterFreeRelease, releaseCapSpaces, stretchCapSpaces, type ReleaseOperationKind, type ThreeYearValues } from "@/lib/release-operations";
import { calculateCapSpace, followingSeasonName, seasonEndYear } from "@/lib/season-time";
import { allowedStretchYears, canApplyStretchProvision, applyContextualContractCut } from "@/lib/stretch-provision";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";
import { capOverrideSummary, hasBlockingDpeCutCapViolation, requireCapCompliance, salaryCapWarningsForSpaces } from "@/lib/cap-override";
import {
  freeReleaseReasonAvailability,
  freeReleaseReasonLabels,
  isFreeReleaseReason,
  type FreeReleaseReason,
} from "@/lib/free-release";
import { isUnresolvedTeamOption } from "@/lib/team-option-contract";
import { roleMinimumRecoverySlotErrorForEntries, roleMinimumShortage } from "@/lib/role-minimums";

export async function applyRosterExitOperation(formData: FormData) {
  const returnPath = "/admin/altre-operazioni";
  const teamCode = String(formData.get("team_code") ?? "").trim().toUpperCase();
  const playerName = String(formData.get("player_name") ?? "").trim();
  const kind = String(formData.get("operation_kind") ?? "") as ReleaseOperationKind;
  const rawCutStretchYears = String(formData.get("cut_stretch_years") ?? "").trim();
  const cutStretchYears = rawCutStretchYears === "" ? null : Number(rawCutStretchYears);
  const confirmed = formData.get("confirmed") === "true";
  const roleMinimumConfirmed = formData.get("role_minimum_confirmed") === "true";
  const submittedReleaseReasons = formData.getAll("release_reason").map((value) => String(value));
  if (!teamCode || !playerName || !["cut", "free_release", "buyout"].includes(kind)) {
    operationError(returnPath, "Operazione non valida.");
  }

  const { supabase, season } = await operationContext(returnPath);
  const leagueMoment = leagueMomentFromSeason(season);
  const state = await loadEditableLeagueState();
  const entryIndex = state.rosterEntries.findIndex((entry) => entry.teamCode === teamCode && entry.name === playerName);
  const entry = state.rosterEntries[entryIndex];
  if (!entry) operationError(returnPath, "Il giocatore non appartiene alla squadra selezionata.");
  if (cutStretchYears !== null && (kind !== "cut" || entry.state !== "active" || ![2, 3].includes(cutStretchYears))) {
    operationError(returnPath, "La stretch immediata richiede il taglio di un giocatore attivo idoneo.");
  }
  const listedPlayer = state.playerList.find((player) => player.name === entry.name);
  const freeReleasePlayer = {
    ...entry,
    rookie: listedPlayer?.rookie ?? false,
    under23: listedPlayer?.under23 ?? false,
  };
  if (isUnresolvedTeamOption(entry, leagueMoment, season.name)) {
    operationError(returnPath, "Un contratto da rookie ancora da risolvere può essere gestito soltanto nel pannello Contratti da rookie.");
  }
  if (kind === "cut" && entry.state !== "active") operationError(returnPath, "Puoi tagliare soltanto un giocatore attivo.");
  if (kind === "buyout" && entry.state !== "active") {
    operationError(returnPath, "Il buyout richiede un giocatore ancora sotto contratto e attivo.");
  }
  if (kind === "buyout" && !confirmed) operationError(returnPath, "Conferma i requisiti regolamentari.");
  if (kind === "buyout" && !operationWindows.buyout(leagueMoment)) operationError(returnPath, "La finestra dei buyout non è aperta.");
  let releaseReason: FreeReleaseReason | null = null;
  if (kind === "free_release") {
    const oneCreditTeamOptionRelease = freeReleaseReasonAvailability("one_credit_team_option", leagueMoment, freeReleasePlayer, season.name);
    if (oneCreditTeamOptionRelease.available) {
      if (submittedReleaseReasons.length !== 0) operationError(returnPath, "Per una T.O. da 1 credito non serve selezionare una causa di rilascio.");
      releaseReason = "one_credit_team_option";
    } else {
      if (submittedReleaseReasons.length !== 1 || !isFreeReleaseReason(submittedReleaseReasons[0])) {
        operationError(returnPath, "Seleziona una e una sola causa di rilascio gratuito.");
      }
      releaseReason = submittedReleaseReasons[0];
      const availability = freeReleaseReasonAvailability(releaseReason, leagueMoment, freeReleasePlayer, season.name);
      if (!availability.available) operationError(returnPath, availability.unavailableReason ?? "Questa causa di rilascio non è disponibile.");
    }
  }

  const charges = playerCharges(entry, season.name, season.status, season.team_options_resolved);
  const dpeExemption = entry.state === "active" && entry.slot === "dpe";
  const currentEndYear = seasonEndYear(season.name);
  if (currentEndYear === null) operationError(returnPath, "Annata non valida.");
  let rosterEntries: RosterEntry[];
  let buyoutTotalResidual: number | null = null;
  if (kind === "free_release") {
    if (!releaseReason) operationError(returnPath, "Seleziona una causa di rilascio gratuito.");
    rosterEntries = rosterAfterFreeRelease(state.rosterEntries, entryIndex, currentEndYear);
  } else if (kind === "buyout") {
    if (season.status !== "regular_season") operationError(returnPath, "Il buyout è disponibile soltanto durante la regular season.");
    const remainingYears = charges.filter((charge) => charge > 0).length;
    if (remainingYears <= 1) operationError(returnPath, "Il buyout richiede più di una stagione residua.");
    const totalResidual = charges.reduce((total, charge) => total + charge, 0);
    buyoutTotalResidual = totalResidual;
    rosterEntries = state.rosterEntries.map((item, index) => index === entryIndex ? {
      ...entry,
      state: "cut" as const,
      slot: "regular" as const,
      cost: totalResidual,
      contract: String(currentEndYear).slice(-2),
      buyoutApplied: true,
      scheduledSeasonEndCut: undefined,
    } : item);
  } else {
    try {
      rosterEntries = state.rosterEntries.map((item, index) => index === entryIndex
        ? applyContextualContractCut(item, currentEndYear, leagueMoment, cutStretchYears as 2 | 3 | null)
        : item);
    } catch (error) {
      operationError(returnPath, error instanceof Error ? error.message : "Taglio con stretch non valido.");
    }
  }

  const teamRosterAfter = rosterEntries.filter((item) => item.teamCode === teamCode);
  const roleMinimumSlotError = roleMinimumRecoverySlotErrorForEntries(teamRosterAfter, season.status, leagueMoment);
  if (roleMinimumSlotError) operationError(returnPath, roleMinimumSlotError);
  if (roleMinimumShortage(teamRosterAfter, season.status, leagueMoment).total > 0 && !roleMinimumConfirmed) {
    operationError(returnPath, "Conferma il ripristino obbligatorio dei minimi di ruolo.");
  }

  const spacesBefore = teamCapSpaces(state.rosterEntries, teamCode, season.name, season.status, season.team_options_resolved);
  const expectedSpaces = releaseCapSpaces({
    kind,
    spacesBefore,
    contractCharges: charges,
    cutContractCharges: kind === "cut" ? playerCharges(rosterEntries[entryIndex], season.name, season.status, season.team_options_resolved) : undefined,
    currentDpeExemption: dpeExemption,
  });
  const spacesAfter = teamCapSpaces(rosterEntries, teamCode, season.name, season.status, season.team_options_resolved);
  if (spacesAfter.some((space, index) => space !== expectedSpaces[index])) operationError(returnPath, "Il calcolo del cap non è coerente: aggiorna la pagina.");
  const capWarnings = salaryCapWarningsForSpaces({
    before: spacesBefore,
    after: spacesAfter,
    seasonNames: [0, 1, 2].map((distance) => followingSeasonName(season.name, distance)),
    phase: season.status,
    currentMoment: leagueMoment,
    currentLimit: kind === "buyout" ? 1000 : undefined,
  });
  if (hasBlockingDpeCutCapViolation(kind === "cut" && dpeExemption, capWarnings)) {
    operationError(returnPath, `Taglio dalla DPE non consentito: ${capWarnings.join(" ")}`);
  }
  requireCapCompliance(capWarnings, (message) => operationError(returnPath, message));
  const nextState = {
    ...state,
    rosterEntries,
    qualifyingOfferRights: state.qualifyingOfferRights.filter((right) => (
      right.teamCode !== teamCode || right.playerName !== playerName
    )),
  };
  const label = kind === "cut" ? "Taglio registrato" : kind === "free_release" ? "Rilascio gratuito registrato" : "Buyout registrato";
  const releaseDetail = releaseReason ? ` · ${freeReleaseReasonLabels[releaseReason]}` : "";
  const buyoutDetail = buyoutTotalResidual === null
    ? ""
    : ` · costo concentrato ${buyoutTotalResidual}, scadenza ${String(seasonEndYear(season.name)).slice(-2)}`;
  const stretchDetail = cutStretchYears === null ? "" : ` · stretch provision in ${cutStretchYears} anni: ${rosterEntries[entryIndex].cost} crediti, scadenza ${rosterEntries[entryIndex].contract}`;
  const response = await persistLeagueMovement(supabase, state, nextState, kind, capOverrideSummary(`${label}: ${playerName} (${teamCode}) · costo ${entry.cost}, contratto ${entry.contract}${releaseDetail}${buyoutDetail}${stretchDetail}`, capWarnings, false));
  if (response.error) operationError(returnPath, response.error.message);
  revalidateOperationPaths();
  redirect(`${returnPath}?updated=${encodeURIComponent(`${label}: ${playerName}.${cutStretchYears === null ? "" : ` Stretch provision in ${cutStretchYears} anni.`}`)}`);
}

export async function applyStretchProvision(formData: FormData) {
  const returnPath = "/admin/altre-operazioni";
  const teamCode = String(formData.get("team_code") ?? "").trim().toUpperCase();
  const playerName = String(formData.get("player_name") ?? "").trim();
  const installments = Number(formData.get("installments"));
  if (!teamCode || !playerName || (installments !== 2 && installments !== 3)) operationError(returnPath, "Operazione non valida.");

  const { supabase, season } = await operationContext(returnPath);
  const leagueMoment = leagueMomentFromSeason(season);
  const state = await loadEditableLeagueState();
  const entryIndex = state.rosterEntries.findIndex((entry) => entry.teamCode === teamCode && entry.name === playerName);
  const entry = state.rosterEntries[entryIndex];
  const currentEndYear = seasonEndYear(season.name);
  if (currentEndYear === null) operationError(returnPath, "Annata non valida.");
  if (!entry || !canApplyStretchProvision(entry, currentEndYear)) operationError(returnPath, "Questo contratto non è idoneo alla stretch provision.");
  if (!allowedStretchYears(entry, currentEndYear).includes(installments as 2 | 3)) operationError(returnPath, "Numero di rate non consentito per questo contratto.");

  const spacesBefore = teamCapSpaces(state.rosterEntries, teamCode, season.name, season.status, season.team_options_resolved);
  const residualCharges = playerCharges(entry, season.name, season.status, season.team_options_resolved);
  if (residualCharges.every((charge) => charge <= 0)) operationError(returnPath, "Il contratto non ha un peso residuo da distribuire.");
  const stretch = stretchCapSpaces(spacesBefore, residualCharges, installments as 2 | 3);
  const finalExpiry = currentEndYear + installments - 1;
  const rosterEntries = state.rosterEntries.map((item, index) => index === entryIndex ? {
    ...item,
    cost: stretch.installment,
    contract: String(finalExpiry).slice(-2),
    stretchProvisionApplied: true,
  } : item);
  const spacesAfter = teamCapSpaces(rosterEntries, teamCode, season.name, season.status, season.team_options_resolved);
  if (spacesAfter.some((space, index) => space !== stretch.spacesAfter[index])) operationError(returnPath, "Il calcolo delle rate non è coerente: aggiorna la pagina.");
  const capWarnings = salaryCapWarningsForSpaces({
    before: spacesBefore,
    after: spacesAfter,
    seasonNames: [0, 1, 2].map((distance) => followingSeasonName(season.name, distance)),
    phase: season.status,
    currentMoment: leagueMoment,
  });
  requireCapCompliance(capWarnings, (message) => operationError(returnPath, message));

  const nextState = { ...state, rosterEntries };
  const response = await persistLeagueMovement(supabase, state, nextState, "stretch_provision", capOverrideSummary(`${playerName} (${teamCode}): stretch provision in ${installments} rate da ${stretch.installment} crediti; scadenza ${String(finalExpiry).slice(-2)}`, capWarnings, false));
  if (response.error) operationError(returnPath, response.error.message);
  revalidateOperationPaths();
  redirect(`${returnPath}?updated=${encodeURIComponent(`Stretch provision applicata a ${playerName}: ${installments} rate da ${stretch.installment}.`)}`);
}

async function operationContext(returnPath: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) operationError(returnPath, "Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) operationError(returnPath, "Sessione scaduta.");
  const response = await supabase
    .from("seasons")
    .select("name,status,team_options_resolved,trade_deadline_passed,timeline_moment")
    .eq("is_active", true)
    .maybeSingle();
  if (response.error || !response.data) operationError(returnPath, response.error?.message ?? "Nessuna stagione attiva.");
  return { supabase, season: response.data };
}

function playerCharges(entry: RosterEntry, seasonName: string, phase: string, teamOptionsResolved: boolean): ThreeYearValues {
  const countTeamOptions = phase !== "offseason" || teamOptionsResolved;
  return [0, 1, 2].map((distance) => 1000 - calculateCapSpace({
    entries: [entry],
    seasonName: followingSeasonName(seasonName, distance),
    optionSeasonName: seasonName,
    countTeamOptions,
  })) as ThreeYearValues;
}

function teamCapSpaces(entries: RosterEntry[], teamCode: string, seasonName: string, phase: string, teamOptionsResolved: boolean): ThreeYearValues {
  const countTeamOptions = phase !== "offseason" || teamOptionsResolved;
  return [0, 1, 2].map((distance) => calculateCapSpace({
    entries: entries.filter((entry) => entry.teamCode === teamCode && (
      distance !== 0 || entry.state !== "active" || entry.slot !== "dpe"
    )),
    seasonName: followingSeasonName(seasonName, distance),
    optionSeasonName: seasonName,
    countTeamOptions,
  })) as ThreeYearValues;
}

function revalidateOperationPaths() {
  ["/squadre", "/giocatori", "/movimenti", "/admin", "/admin/altre-operazioni"]
    .forEach((path) => revalidatePath(path));
}

function operationError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
