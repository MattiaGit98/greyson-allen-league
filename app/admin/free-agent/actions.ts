"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PlayerListEntry, RosterEntry } from "@/lib/league-types";
import { normalizePlayerName } from "@/lib/admin-alerts";
import { loadEditableLeagueState } from "@/lib/league-state";
import { persistLeagueMovement } from "@/lib/league-movements";
import { automaticFreeAgentContract, evaluateFreeAgentSigning } from "@/lib/rules/free-agent";
import { countRosterRoles } from "@/lib/rules/roster";
import { calculateCapSpace, seasonEndYear } from "@/lib/season-time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasReachedMoment, leagueMomentFromSeason, operationWindows, tradeDeadlineHasPassed } from "@/lib/league-moments";
import { requireCapCompliance } from "@/lib/cap-override";
import {
  applyStandardContractCut,
  isUnresolvedTeamOption,
} from "@/lib/team-option-contract";
import { legalSlotDestinations, type ManagedRosterSlot } from "@/lib/slot-eligibility";
import { dpeCountsForRoleMinimums, roleMinimumChecksApply, roleMinimumRecoverySlotErrorForEntries, roleMinimumShortage } from "@/lib/role-minimums";
import { inheritedDpeSeasons } from "@/lib/dpe-rules";
import { orderPlayerListByRole } from "@/lib/player-list-order";
import { parseContextualSlotDecisions, resolveContextualSlots, type AppliedContextualSlotOperation } from "@/lib/contextual-slot-resolution";

const path = "/admin/free-agent";

export async function signFreeAgent(formData: FormData) {
  const buyoutTopSixConfirmed = formData.get("buyout_top_six_confirmed") === "true";
  const roleMinimumConfirmed = formData.get("role_minimum_confirmed") === "true";
  const roleMinimumReplacement = formData.get("role_minimum_replacement") === "true";
  const playerSource = clean(formData.get("player_source"));
  const playerName = clean(formData.get("player_name"));
  const playerRole = clean(formData.get("player_role"));
  const teamCode = clean(formData.get("team_code")).toUpperCase();
  let slotDecisions;
  try {
    slotDecisions = parseContextualSlotDecisions(formData.get("slot_resolution_json"));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Operazioni contestuali non valide.");
  }
  const price = Number(formData.get("price"));
  const destination = clean(formData.get("destination")) as "regular" | "two_way";
  if (!["list", "outside"].includes(playerSource) || !playerName || playerName.length > 120 || !teamCode || !["regular", "two_way"].includes(destination)) {
    fail("Dati della firma non validi.");
  }
  if (playerSource === "outside" && !["G", "A", "C", "X"].includes(playerRole)) {
    fail("Per il giocatore fuori listone devi indicare il ruolo.");
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
  const moment = leagueMomentFromSeason(seasonResponse.data);
  const activeSeasonName = seasonResponse.data.name;
  if (!operationWindows.freeAgency(moment)) fail("La free agency non è aperta in questo momento della lega.");
  const state = await loadEditableLeagueState();
  if (state.playerListStatus !== "published") fail("Il listone ufficiale non è ancora pubblicato.");
  if (!state.teams.some((team) => team.code === teamCode)) fail("Squadra non valida.");
  const normalizedPlayerName = normalizePlayerName(playerName);
  const listedPlayer = state.playerList.find((item) => normalizePlayerName(item.name) === normalizedPlayerName);
  let player: PlayerListEntry;
  if (playerSource === "list") {
    if (!listedPlayer) fail("Il giocatore non è presente nel listone.");
    player = listedPlayer;
  } else {
    if (listedPlayer) fail("Il giocatore è già nel listone: selezionalo dalla ricerca.");
    player = {
      name: playerName.replace(/\s+/g, " "),
      role: playerRole as PlayerListEntry["role"],
      realTeam: "FA",
      rookie: false,
      under23: false,
    };
  }
  const buyoutFreeAgent = playerSource === "list" && state.rosterEntries.some((entry) => (
    normalizePlayerName(entry.name) === normalizedPlayerName
    && entry.state === "cut"
    && entry.buyoutApplied === true
  ));
  if (buyoutFreeAgent && !buyoutTopSixConfirmed) {
    fail("Conferma di aver verificato che la squadra occupi una delle prime otto posizioni della regular season per firmare questo free agent soggetto a buyout.");
  }
  const activePlayer = state.rosterEntries.find((entry) => normalizePlayerName(entry.name) === normalizedPlayerName && entry.state === "active");
  const qualifyingOffer = state.qualifyingOfferRights.find((right) => normalizePlayerName(right.playerName) === normalizedPlayerName);
  const teamEntries = state.rosterEntries.filter((entry) => entry.teamCode === teamCode);
  const activeEntries = teamEntries.filter((entry) => entry.state === "active");
  const roleByName = new Map(state.playerList.map((item) => [
    normalizePlayerName(item.name),
    item.role === "X" ? null : item.role,
  ]));
  const managedActiveEntries = activeEntries.filter((entry) => entry.slot !== "dpe");
  const slotResolution = resolveContextualSlots({
    counts: {
      regular: managedActiveEntries.filter((entry) => entry.slot === "regular").length,
      two_way: managedActiveEntries.filter((entry) => entry.slot === "two_way").length,
      g_league: managedActiveEntries.filter((entry) => entry.slot === "g_league").length,
    },
    incomingSlot: destination,
    players: managedActiveEntries.map((entry) => ({
      name: entry.name,
      slot: entry.slot as ManagedRosterSlot,
      cuttable: !isUnresolvedTeamOption(entry, moment, activeSeasonName),
      moveDestinations: isUnresolvedTeamOption(entry, moment, activeSeasonName)
        ? []
        : legalSlotDestinations(
          { ...entry, slot: entry.slot as ManagedRosterSlot },
          activeSeasonName,
          moment,
        ).filter((destination) => destination !== entry.slot),
    })),
    decisions: slotDecisions,
  });
  if (slotResolution.errors.length) fail(slotResolution.errors.join(" "));
  if (!slotResolution.complete) fail("Completa le operazioni contestuali necessarie per liberare gli slot.");
  const contextualCuts = new Set(slotResolution.operations.filter((operation) => operation.kind === "cut").map((operation) => operation.playerName));
  const contextualMoves = new Map(slotResolution.operations.flatMap((operation) => (
    operation.kind === "move" ? [[operation.playerName, operation.destinationSlot] as const] : []
  )));
  const contextualCutEntries = managedActiveEntries.filter((entry) => contextualCuts.has(entry.name));
  const currentCost = 1000 - calculateCapSpace({
    entries: teamEntries.filter((entry) => entry.state !== "active" || entry.slot !== "dpe"),
    seasonName: seasonResponse.data.name,
    optionSeasonName: seasonResponse.data.name,
    countTeamOptions: true,
  });
  const evaluation = evaluateFreeAgentSigning({
    phase: seasonResponse.data.status,
    enforceRoleMinimums: roleMinimumChecksApply(seasonResponse.data.status, moment),
    freeAgentThousandLimitApplies: !hasReachedMoment(moment, "free_agency_reopening"),
    currentCost,
    price,
    destination,
    slots: {
      regular: activeEntries.filter((entry) => entry.slot === "regular").length,
      twoWay: activeEntries.filter((entry) => entry.slot === "two_way").length,
      gLeague: activeEntries.filter((entry) => entry.slot === "g_league").length,
      dpe: activeEntries.filter((entry) => entry.slot === "dpe").length,
    },
    playerSelected: true,
    playerAlreadyOwned: Boolean(activePlayer),
    qualifyingOfferActive: Boolean(qualifyingOffer),
    roles: countRosterRoles(activeEntries.map((entry) => ({
      role: roleByName.get(normalizePlayerName(entry.name)) ?? null,
      slot: entry.slot,
    })), dpeCountsForRoleMinimums(moment)),
    playerRole: player.role === "X" ? null : player.role,
    cutRole: null,
    cutSlot: null,
    contextualCuts: contextualCutEntries.map((entry) => ({
      role: roleByName.get(normalizePlayerName(entry.name)) ?? null,
      slot: entry.slot as ManagedRosterSlot,
    })),
    contextualMoves: slotResolution.operations.flatMap((operation) => (
      operation.kind === "move" ? [{ sourceSlot: operation.sourceSlot, destinationSlot: operation.destinationSlot }] : []
    )),
  });
  if (!evaluation.valid) fail(evaluation.errors.map((issue) => issue.message).join(" "));

  const roleShortageBefore = roleMinimumShortage(teamEntries, seasonResponse.data.status, moment);
  if (roleMinimumReplacement) {
    if (playerSource !== "list" || price !== 1) fail("Il free agent per carenza di ruolo deve provenire dal listone e costare 1 credito.");
    const playerRole = player.role === "X" ? null : player.role;
    if (!playerRole || roleShortageBefore[playerRole] <= 0) {
      fail("Il giocatore selezionato non copre una carenza di ruolo della squadra.");
    }
  }

  const endYear = seasonEndYear(seasonResponse.data.name);
  if (!endYear) fail("Annata non valida.");
  const contract = automaticFreeAgentContract(
    seasonResponse.data.name,
    tradeDeadlineHasPassed(moment) || roleMinimumReplacement,
  );
  if (!contract) fail("Annata non valida.");
  const dpeAppliedSeasons = inheritedDpeSeasons(state.rosterEntries, player.name);
  const rosterEntry: RosterEntry = {
    name: player.name,
    role: player.role === "X" ? undefined : player.role,
    cost: price,
    contract,
    state: "active",
    slot: destination,
    teamCode,
    stretchProvisionApplied: false,
    buyoutApplied: false,
    freeAgentSignedSeason: seasonResponse.data.name,
    contractStartSeason: seasonResponse.data.name,
    ...(dpeAppliedSeasons.length ? { dpeAppliedSeasons } : {}),
  };
  const rosterEntries = [
    ...state.rosterEntries.map((entry) => {
      if (contextualCuts.has(entry.name) && entry.teamCode === teamCode && entry.state === "active") {
        return applyStandardContractCut(entry, endYear, moment);
      }
      const moveDestination = contextualMoves.get(entry.name);
      if (moveDestination && entry.teamCode === teamCode && entry.state === "active") return { ...entry, slot: moveDestination };
      return entry;
    }),
    rosterEntry,
  ];
  const teamRosterAfter = rosterEntries.filter((entry) => entry.teamCode === teamCode);
  const roleShortageAfter = roleMinimumShortage(teamRosterAfter, seasonResponse.data.status, moment);
  if (roleMinimumReplacement && roleShortageAfter.total >= roleShortageBefore.total) {
    fail("L'assegnazione per carenza di ruolo deve ridurre effettivamente la carenza della squadra.");
  }
  const roleMinimumSlotError = roleMinimumRecoverySlotErrorForEntries(teamRosterAfter, seasonResponse.data.status, moment);
  if (roleMinimumSlotError) fail(roleMinimumSlotError);
  if (roleMinimumShortage(teamRosterAfter, seasonResponse.data.status, moment).total > 0 && !roleMinimumConfirmed) {
    fail("Conferma il ripristino obbligatorio dei minimi di ruolo.");
  }
  const afterCost = 1000 - calculateCapSpace({
    entries: rosterEntries.filter((entry) => entry.teamCode === teamCode && (entry.state !== "active" || entry.slot !== "dpe")),
    seasonName: seasonResponse.data.name,
    optionSeasonName: seasonResponse.data.name,
    countTeamOptions: true,
  });
  const roleMinimumCapException = roleMinimumReplacement
    && price === 1
    && afterCost <= currentCost + 1;
  const capWarnings = [
    ...(!hasReachedMoment(moment, "free_agency_reopening") && afterCost > 1000 && price > 1
      ? [`Il free agent può essere acquistato per più di 1 credito soltanto se il cap resta entro quota 1000 (cap libero ${1000 - afterCost}).`]
      : []),
    ...(afterCost > 1100 && (currentCost <= 1100 || afterCost > currentCost) && !roleMinimumCapException
      ? [`La firma aumenterebbe il cap oltre quota 1100 (cap libero ${1000 - afterCost}).`]
      : []),
  ];
  requireCapCompliance(capWarnings, fail);
  const nextState = {
    ...state,
    rosterEntries,
    playerList: playerSource === "outside" ? orderPlayerListByRole([...state.playerList, player]) : state.playerList,
  };
  const response = await persistLeagueMovement(
    supabase,
    state,
    nextState,
    "firma_free_agent",
    `${player.name}: firmato da ${teamCode} per ${price} crediti; slot ${freeAgentSlotLabel(destination)}; contratto ${rosterEntry.contract}${roleMinimumReplacement ? "; assegnazione per carenza di ruolo" : ""}${playerSource === "outside" ? "; aggiunto al listone" : ""}${contextualOperationSummary(slotResolution.operations)}`,
  );
  if (response.error) fail(response.error.message);

  ["/squadre", "/giocatori", "/movimenti", "/admin", path, "/admin/listone", "/admin/asta"].forEach((route) => revalidatePath(route));
  const suffix = contextualOperationSuccessSuffix(slotResolution.operations);
  redirect(`${path}?updated=${encodeURIComponent(`${player.name} firmato da ${teamCode} per ${price}.${suffix}`)}`);
}

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function freeAgentSlotLabel(slot: string) {
  if (slot === "regular") return "Roster";
  if (slot === "two_way") return "Two-way";
  if (slot === "g_league") return "G-League";
  return slot;
}

function contextualOperationSummary(operations: AppliedContextualSlotOperation[]) {
  return operations.map((operation) => (
    operation.kind === "cut"
      ? `; taglio contestuale di ${operation.playerName}`
      : `; spostamento contestuale di ${operation.playerName} verso ${freeAgentSlotLabel(operation.destinationSlot)}`
  )).join("");
}

function contextualOperationSuccessSuffix(operations: AppliedContextualSlotOperation[]) {
  return operations.map((operation) => (
    operation.kind === "cut"
      ? ` Taglio contestuale: ${operation.playerName}.`
      : ` Spostamento contestuale: ${operation.playerName} verso ${freeAgentSlotLabel(operation.destinationSlot)}.`
  )).join("");
}

function fail(message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
