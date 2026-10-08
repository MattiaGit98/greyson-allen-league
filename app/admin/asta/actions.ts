"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  acquisitionKindForOutcome,
  auctionContractAtPurchase,
  auctionDestinationErrors,
  isPostAuctionContractAssignmentCandidate,
  isAuctionablePlayerRole,
  legalAuctionContextualDestinations,
  qualifyingAuctionErrors,
  type AuctionSlot,
  type QualifyingAuctionOutcome,
} from "@/lib/auction-management";
import type { RosterEntry } from "@/lib/league-types";
import { loadEditableLeagueState, type EditableLeagueState } from "@/lib/league-state";
import { persistLeagueMovement } from "@/lib/league-movements";
import { calculateCapSpace, followingSeasonName, seasonEndYear } from "@/lib/season-time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";
import { capOverrideSummary, requireCapCompliance } from "@/lib/cap-override";
import { contractIncludesTeamOption, slotEligibilityErrors, slotMoveTimingErrors, type ManagedRosterSlot } from "@/lib/slot-eligibility";
import { annualTeamOptionContract, applyStandardContractCut } from "@/lib/team-option-contract";
import { freeReleaseReasonAvailability } from "@/lib/free-release";
import { applyFreeRelease } from "@/lib/release-operations";
import { inheritedDpeSeasons } from "@/lib/dpe-rules";
import { parseContextualSlotDecisions, resolveContextualSlots, type AppliedContextualSlotOperation } from "@/lib/contextual-slot-resolution";
import { applyContextualContractCut, canStretchContextualCut } from "@/lib/stretch-provision";

const auctionPath = "/admin/asta";
type AuctionEditKind = "cut" | "free_release" | "slot";

export async function purchaseAuctionPlayer(formData: FormData) {
  const onlyAuctionable = formData.get("only_auctionable") === "1";
  const playerName = cleanText(formData.get("player_name"));
  const teamCode = cleanText(formData.get("team_code")).toUpperCase();
  const price = Number(formData.get("price"));
  const slot = cleanText(formData.get("slot")) as AuctionSlot;
  let slotDecisions;
  try {
    slotDecisions = parseContextualSlotDecisions(formData.get("slot_resolution_json"));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Operazioni contestuali non valide.");
  }
  const qualifyingOutcome = cleanText(formData.get("qualifying_outcome")) as QualifyingAuctionOutcome;
  if (!playerName || !teamCode || !["regular", "two_way", "g_league"].includes(slot)) fail("Dati dell'acquisto non validi.");

  const { supabase, season } = await auctionContext();
  const state = await loadEditableLeagueState();
  if (state.playerListStatus !== "published") fail("Il listone ufficiale non è ancora pubblicato.");
  const pendingDraftPicks = currentSeasonDraftAssets(state, season.name);
  if (pendingDraftPicks.length) {
    fail(`Concludi prima il Draft ${season.name.slice(0, 4)}: restano ${pendingDraftPicks.length} scelte da assegnare.`);
  }
  const player = state.playerList.find((item) => item.name === playerName);
  if (!player) fail("Il giocatore non è presente nel listone.");
  if (!isAuctionablePlayerRole(player.role)) fail("Un giocatore senza ruolo non può essere acquistato all'asta.");
  if (!state.teams.some((team) => team.code === teamCode)) fail("Squadra non valida.");
  if (state.rosterEntries.some((entry) => entry.name === playerName && entry.state === "active")) {
    fail("Il giocatore appartiene già a una squadra.");
  }
  const qualifyingRight = state.qualifyingOfferRights.find((right) => right.playerName === playerName);
  const qualifyingErrors = qualifyingAuctionErrors({
    hasQualifyingRight: Boolean(qualifyingRight),
    outcome: qualifyingOutcome,
    rightTeamCode: qualifyingRight?.teamCode,
    rightAmount: qualifyingRight?.qualifyingAmount,
    teamCode,
    price,
    slot,
  });
  if (qualifyingErrors.length) fail(qualifyingErrors.join(" "));
  const auctionAcquisition = acquisitionKindForOutcome(qualifyingOutcome);
  const destinationErrors = auctionDestinationErrors({ slot, price, rookie: player.rookie, under23: player.under23 });
  if (destinationErrors.length) fail(destinationErrors.join(" "));

  const currentEndYear = seasonEndYear(season.name);
  if (currentEndYear === null) fail("Annata non valida.");
  const moment = leagueMomentFromSeason(season);
  const teamActiveEntries = state.rosterEntries.filter((entry) => (
    entry.teamCode === teamCode && entry.state === "active" && entry.slot !== "dpe"
  ));
  const slotResolution = resolveContextualSlots({
    counts: {
      regular: teamActiveEntries.filter((entry) => entry.slot === "regular").length,
      two_way: teamActiveEntries.filter((entry) => entry.slot === "two_way").length,
      g_league: teamActiveEntries.filter((entry) => entry.slot === "g_league").length,
    },
    incomingSlot: slot,
    players: teamActiveEntries.map((entry) => {
      const listedPlayer = state.playerList.find((item) => item.name === entry.name);
      return {
        name: entry.name,
        slot: entry.slot as AuctionSlot,
        cuttable: true,
        stretchEligible: canStretchContextualCut(entry, currentEndYear),
        freeReleasable: freeReleaseReasonAvailability(
          "one_credit_team_option",
          moment,
          {
            ...entry,
            rookie: listedPlayer?.rookie ?? false,
            under23: listedPlayer?.under23 ?? false,
          },
          season.name,
        ).available,
        moveDestinations: legalAuctionContextualDestinations({
          entry,
          rookie: listedPlayer?.rookie ?? false,
          under23: listedPlayer?.under23 ?? false,
          seasonName: season.name,
          moment,
        }),
      };
    }),
    decisions: slotDecisions,
  });
  if (slotResolution.errors.length) fail(slotResolution.errors.join(" "));
  if (!slotResolution.complete) fail("Completa le operazioni contestuali necessarie per liberare gli slot.");
  const contextualCuts = new Map(slotResolution.operations.flatMap((operation) => (
    operation.kind === "cut" ? [[operation.playerName, operation.stretchYears] as const] : []
  )));
  const contextualFreeReleases = new Set(slotResolution.operations.filter((operation) => operation.kind === "free_release").map((operation) => operation.playerName));
  const contextualMoves = new Map(slotResolution.operations.flatMap((operation) => (
    operation.kind === "move" ? [[operation.playerName, operation.destinationSlot] as const] : []
  )));

  const dpeAppliedSeasons = inheritedDpeSeasons(state.rosterEntries, player.name);
  const contractAtPurchase = auctionContractAtPurchase({
    price,
    acquisition: auctionAcquisition,
    currentSeasonEndYear: currentEndYear,
  });
  const rosterEntry: RosterEntry = {
    name: player.name,
    role: player.role === "X" ? undefined : player.role,
    ...contractAtPurchase,
    state: "active",
    slot,
    teamCode,
    stretchProvisionApplied: false,
    buyoutApplied: false,
    auctionAcquisition,
    contractStartSeason: season.name,
    ...(dpeAppliedSeasons.length ? { dpeAppliedSeasons } : {}),
  };
  const rosterEntries = [
    ...state.rosterEntries.map((entry) => {
      if (contextualFreeReleases.has(entry.name) && entry.teamCode === teamCode && entry.state === "active") {
        return applyFreeRelease(entry, currentEndYear);
      }
      if (contextualCuts.has(entry.name) && entry.teamCode === teamCode && entry.state === "active") {
        return applyContextualContractCut(entry, currentEndYear, "auction_start", contextualCuts.get(entry.name));
      }
      const moveDestination = contextualMoves.get(entry.name);
      if (moveDestination && entry.teamCode === teamCode && entry.state === "active") return { ...entry, slot: moveDestination };
      return entry;
    }),
    rosterEntry,
  ];
  const overflow = slotOverflow(rosterEntries, teamCode);
  if (overflow.length) fail(`L'acquisto supera i limiti degli slot: ${overflow.join("; ")}. Seleziona un giocatore da tagliare.`);
  const afterSpace = capSpaces(rosterEntries, teamCode, season.name)[0];
  const capWarnings = afterSpace < 0 && price > 1
    ? [`Oltre quota 1000, in asta si può acquistare soltanto per 1 credito (cap libero ${afterSpace}).`]
    : [];
  if (slotResolution.operations.some((operation) => operation.kind === "cut" && operation.stretchYears != null)
    && capSpaces(rosterEntries, teamCode, season.name).slice(1).some((space) => space < 0)) {
    capWarnings.push("La stretch provision contestuale non rispetta il cap delle stagioni future.");
  }
  requireCapCompliance(capWarnings, fail);
  const nextState: EditableLeagueState = {
    ...state,
    rosterEntries,
    qualifyingOfferRights: state.qualifyingOfferRights.filter((right) => (
      right.playerName !== playerName && !contextualFreeReleases.has(right.playerName)
    )),
  };
  await persistAuctionState(
    supabase,
    state,
    nextState,
    "acquisto_asta",
    capOverrideSummary(`${playerName}: acquistato da ${teamCode} per ${price} crediti; slot ${slotLabel(slot)}; ${auctionContractSummary(rosterEntry)}; ${acquisitionSummary(qualifyingOutcome)}${contextualOperationSummary(slotResolution.operations)}`, capWarnings, false),
  );

  const suffix = contextualOperationSuccessSuffix(slotResolution.operations);
  success(`${playerName} assegnato a ${teamCode} per ${price} crediti.${suffix}`, onlyAuctionable);
}

function auctionContractSummary(entry: RosterEntry) {
  return entry.auctionAcquisition === "qualifying_offer"
    ? `contratto annuale ${entry.contract}`
    : "contratto da assegnare";
}

function acquisitionSummary(outcome: QualifyingAuctionOutcome) {
  if (outcome === "qualifying_offer") return "Q.O. accettata";
  if (outcome === "restricted_free_agent") return "restricted free agent";
  return "asta normale";
}

function contextualOperationSummary(operations: AppliedContextualSlotOperation[]) {
  return operations.map((operation) => (
    operation.kind === "cut"
      ? `; taglio contestuale di ${operation.playerName}${operation.stretchYears ? ` con stretch provision in ${operation.stretchYears} anni` : ""}`
      : operation.kind === "free_release"
        ? `; rilascio gratuito contestuale di ${operation.playerName}`
      : `; spostamento contestuale di ${operation.playerName} verso ${slotLabel(operation.destinationSlot)}`
  )).join("");
}

function contextualOperationSuccessSuffix(operations: AppliedContextualSlotOperation[]) {
  return operations.map((operation) => (
    operation.kind === "cut"
      ? ` Taglio contestuale: ${operation.playerName}.`
      : operation.kind === "free_release"
        ? ` Rilascio gratuito contestuale: ${operation.playerName}.`
      : ` Spostamento contestuale: ${operation.playerName} verso ${slotLabel(operation.destinationSlot)}.`
  )).join("");
}

export async function modifyAuctionPlayer(formData: FormData) {
  const onlyAuctionable = formData.get("only_auctionable") === "1";
  const playerName = cleanText(formData.get("player_name"));
  const requestedTeamCode = cleanText(formData.get("team_code")).toUpperCase();
  const kind = cleanText(formData.get("edit_kind")) as AuctionEditKind;
  const newSlot = cleanText(formData.get("new_slot")) as AuctionSlot;
  let slotDecisions;
  try {
    slotDecisions = parseContextualSlotDecisions(formData.get("slot_resolution_json"));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Operazioni contestuali non valide.");
  }
  if (!playerName || !requestedTeamCode || !["cut", "free_release", "slot"].includes(kind)) fail("Operazione non valida.");
  if (kind !== "slot" && slotDecisions.length) fail("Sono state inserite operazioni contestuali non necessarie.");

  const { supabase, season } = await auctionContext();
  const state = await loadEditableLeagueState();
  const pendingDraftPicks = currentSeasonDraftAssets(state, season.name);
  if (pendingDraftPicks.length) {
    fail(`Concludi prima il Draft ${season.name.slice(0, 4)}: restano ${pendingDraftPicks.length} scelte da assegnare.`);
  }
  const player = state.playerList.find((item) => item.name === playerName);
  if (!player) fail("Il giocatore non è presente nel listone.");
  const entryIndex = state.rosterEntries.findIndex((entry) => (
    entry.name === playerName && entry.teamCode === requestedTeamCode && entry.state === "active"
  ));
  const entry = state.rosterEntries[entryIndex];
  if (!entry) fail("Il giocatore non appartiene più alla squadra indicata.");

  let rosterEntries: RosterEntry[];
  let contextualOperations: AppliedContextualSlotOperation[] = [];
  if (kind === "cut") {
    const currentEndYear = seasonEndYear(season.name);
    if (currentEndYear === null) fail("Annata non valida.");
    rosterEntries = state.rosterEntries.map((item, index) => index === entryIndex ? {
      ...applyStandardContractCut(item, currentEndYear, "auction_start"),
    } : item);
  } else if (kind === "free_release") {
    const currentEndYear = seasonEndYear(season.name);
    if (currentEndYear === null) fail("Annata non valida.");
    const releasePlayer = {
      ...entry,
      rookie: player.rookie,
      under23: player.under23,
    };
    if (!freeReleaseReasonAvailability("one_credit_team_option", leagueMomentFromSeason(season), releasePlayer, season.name).available) {
      fail("Questo giocatore non è idoneo al rilascio gratuito durante l'asta.");
    }
    rosterEntries = state.rosterEntries.map((item, index) => index === entryIndex
      ? applyFreeRelease(item, currentEndYear)
      : item);
  } else {
    const currentEndYear = seasonEndYear(season.name);
    if (currentEndYear === null) fail("Annata non valida.");
    if (!["regular", "two_way", "g_league"].includes(newSlot)) fail("Slot non valido.");
    if (entry.slot === "dpe") fail("Il reintegro dalla DPE va registrato nel blocco Altre operazioni.");
    if (newSlot === entry.slot) fail("Seleziona uno slot diverso da quello attuale.");
    if (entry.auctionAcquisition && newSlot !== "regular") {
      fail("Un giocatore acquistato tramite Q.O. o come RFA deve restare nello slot roster.");
    }
    const moment = leagueMomentFromSeason(season);
    const timingErrors = slotMoveTimingErrors(
      { ...entry, slot: entry.slot as ManagedRosterSlot },
      newSlot,
      season.name,
      moment,
    );
    if (timingErrors.length) fail(timingErrors.join(" "));
    if (!isPostAuctionContractAssignmentCandidate(entry, season.name)) {
      const eligibilityErrors = slotEligibilityErrors(entry, newSlot, season.name);
      if (eligibilityErrors.length) fail(eligibilityErrors.join(" "));
    }
    const destinationErrors = auctionDestinationErrors({
      slot: newSlot,
      price: entry.cost,
      rookie: player.rookie,
      under23: player.under23,
    });
    if (destinationErrors.length) fail(destinationErrors.join(" "));

    const remainingTeamEntries = state.rosterEntries.filter((item, index) => (
      index !== entryIndex
      && item.teamCode === requestedTeamCode
      && item.state === "active"
      && item.slot !== "dpe"
    ));
    const slotResolution = resolveContextualSlots({
      counts: {
        regular: remainingTeamEntries.filter((item) => item.slot === "regular").length,
        two_way: remainingTeamEntries.filter((item) => item.slot === "two_way").length,
        g_league: remainingTeamEntries.filter((item) => item.slot === "g_league").length,
      },
      incomingSlot: newSlot,
      players: remainingTeamEntries.map((item) => {
        const listedPlayer = state.playerList.find((candidate) => candidate.name === item.name);
        return {
          name: item.name,
          slot: item.slot as AuctionSlot,
          cuttable: true,
          stretchEligible: canStretchContextualCut(item, currentEndYear),
          freeReleasable: freeReleaseReasonAvailability(
            "one_credit_team_option",
            moment,
            {
              ...item,
              rookie: listedPlayer?.rookie ?? false,
              under23: listedPlayer?.under23 ?? false,
            },
            season.name,
          ).available,
          moveDestinations: legalAuctionContextualDestinations({
            entry: item,
            rookie: listedPlayer?.rookie ?? false,
            under23: listedPlayer?.under23 ?? false,
            seasonName: season.name,
            moment,
          }),
        };
      }),
      decisions: slotDecisions,
    });
    if (slotResolution.errors.length) fail(slotResolution.errors.join(" "));
    if (!slotResolution.complete) fail("Completa le operazioni contestuali necessarie per liberare gli slot.");
    contextualOperations = slotResolution.operations;
    const contextualCuts = new Map(contextualOperations.flatMap((operation) => (
      operation.kind === "cut" ? [[operation.playerName, operation.stretchYears] as const] : []
    )));
    const contextualFreeReleases = new Set(contextualOperations.filter((operation) => operation.kind === "free_release").map((operation) => operation.playerName));
    const contextualMoves = new Map(contextualOperations.flatMap((operation) => (
      operation.kind === "move" ? [[operation.playerName, operation.destinationSlot] as const] : []
    )));

    rosterEntries = state.rosterEntries.map((item, index) => {
      if (index === entryIndex) return applyAuctionSlotMove(item, newSlot, currentEndYear, season.name);
      if (item.teamCode !== requestedTeamCode || item.state !== "active") return item;
      if (contextualFreeReleases.has(item.name)) {
        return applyFreeRelease(item, currentEndYear);
      }
      if (contextualCuts.has(item.name)) return applyContextualContractCut(item, currentEndYear, moment, contextualCuts.get(item.name));
      const moveDestination = contextualMoves.get(item.name);
      if (moveDestination) return applyAuctionSlotMove(item, moveDestination, currentEndYear, season.name);
      return item;
    });

    const overflow = slotOverflow(rosterEntries, requestedTeamCode);
    if (overflow.length) {
      fail(`Lo spostamento supera i limiti degli slot: ${overflow.join("; ")}. Completa la sequenza necessaria per liberarli.`);
    }
  }

  const afterSpaces = capSpaces(rosterEntries, requestedTeamCode, season.name);
  const capWarnings: string[] = [];
  if (afterSpaces.slice(1).some((space) => space < 0)) capWarnings.push("La modifica non rispetta il cap delle stagioni future.");
  if (kind === "cut" && entry.slot === "dpe" && afterSpaces[0] < 0) {
    capWarnings.push("Il taglio dalla DPE farebbe superare il salary cap.");
  }
  if (kind === "slot" && entry.slot === "dpe" && afterSpaces[0] < 0) {
    capWarnings.push("Lo spostamento dalla DPE farebbe superare il salary cap.");
  }
  if (kind === "cut" && entry.slot === "dpe" && capWarnings.length) {
    fail(`Il taglio dalla DPE non può violare il salary cap. ${capWarnings.join(" ")}`);
  }
  requireCapCompliance(capWarnings, fail);

  const detail = modificationDetail(kind, entry, newSlot, contextualOperations);
  const contextualFreeReleaseNames = new Set(contextualOperations.filter((operation) => operation.kind === "free_release").map((operation) => operation.playerName));
  const nextState: EditableLeagueState = {
    ...state,
    rosterEntries,
    qualifyingOfferRights: state.qualifyingOfferRights.filter((right) => (
      !(kind === "free_release" && right.teamCode === requestedTeamCode && right.playerName === playerName)
      && !contextualFreeReleaseNames.has(right.playerName)
    )),
  };
  await persistAuctionState(
    supabase,
    state,
    nextState,
    kind === "cut" ? "cut" : kind === "free_release" ? "free_release" : "spostamento_slot",
    capOverrideSummary(`${playerName}: ${detail}`, capWarnings, false),
  );
  const overflow = slotOverflow(rosterEntries, requestedTeamCode);
  success(`${playerName}: ${detail}.${overflow.length ? ` Attenzione: ${overflow.join("; ")}.` : ""}`, onlyAuctionable);
}

async function auctionContext() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) fail("Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) fail("Sessione scaduta.");
  const response = await supabase
    .from("seasons")
    .select("name,status,team_options_resolved,trade_deadline_passed,timeline_moment")
    .eq("is_active", true)
    .maybeSingle();
  if (response.error || !response.data) fail(response.error?.message ?? "Nessuna stagione attiva.");
  if (!operationWindows.auction(leagueMomentFromSeason(response.data))) {
    fail("Il pannello è operativo da Inizio asta fino a Termine asta.");
  }
  return { supabase, season: response.data };
}

async function persistAuctionState(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  before: EditableLeagueState,
  after: EditableLeagueState,
  operationType: string,
  summary: string,
) {
  const response = await persistLeagueMovement(supabase, before, after, operationType, summary);
  if (response.error) fail(response.error.message);
  [
    "/squadre",
    "/giocatori",
    "/movimenti",
    "/admin",
    "/admin/asta",
    "/admin/listone",
    "/admin/contratti",
    "/admin/free-agent",
    "/admin/scambi",
    "/admin/team-option",
    "/admin/altre-operazioni",
    "/admin/slot",
    "/admin/rettifiche-roster",
    "/admin/draft",
    "/simulatore-scambi",
  ].forEach((path) => revalidatePath(path));
}

function capSpaces(entries: RosterEntry[], teamCode: string, seasonName: string): [number, number, number] {
  return [0, 1, 2].map((distance) => calculateCapSpace({
    entries: entries.filter((entry) => entry.teamCode === teamCode && (
      distance !== 0 || entry.state !== "active" || entry.slot !== "dpe"
    )),
    seasonName: followingSeasonName(seasonName, distance),
    optionSeasonName: seasonName,
    countTeamOptions: true,
  })) as [number, number, number];
}

function slotOverflow(entries: RosterEntry[], teamCode: string) {
  const active = entries.filter((entry) => entry.teamCode === teamCode && entry.state === "active");
  const counts = {
    regular: active.filter((entry) => entry.slot === "regular").length,
    two_way: active.filter((entry) => entry.slot === "two_way").length,
    g_league: active.filter((entry) => entry.slot === "g_league").length,
  };
  const limits = { regular: 15, two_way: 2, g_league: 3 };
  return (Object.keys(limits) as AuctionSlot[])
    .filter((slot) => counts[slot] > limits[slot])
    .map((slot) => `${slotLabel(slot)} ${counts[slot]}/${limits[slot]}`);
}

function applyAuctionSlotMove(entry: RosterEntry, destination: AuctionSlot, currentEndYear: number, seasonName: string): RosterEntry {
  return {
    ...entry,
    slot: destination,
    contract: isPostAuctionContractAssignmentCandidate(entry, seasonName)
      ? "PENDING"
      : destination === "regular" || contractIncludesTeamOption(entry)
        ? entry.contract
        : annualTeamOptionContract(currentEndYear),
  };
}

function modificationDetail(kind: AuctionEditKind, entry: RosterEntry, newSlot: AuctionSlot, contextualOperations: AppliedContextualSlotOperation[]) {
  if (kind === "cut") return `tagliato da ${entry.teamCode}`;
  if (kind === "free_release") return `rilasciato gratuitamente da ${entry.teamCode}`;
  const contextualDetail = contextualOperations.map((operation) => (
    operation.kind === "cut"
      ? `; taglio contestuale di ${operation.playerName}${operation.stretchYears ? ` con stretch provision in ${operation.stretchYears} anni` : ""}`
      : operation.kind === "free_release"
        ? `; rilascio gratuito contestuale di ${operation.playerName}`
      : `; ${operation.playerName} spostato da ${slotLabel(operation.sourceSlot)} a ${slotLabel(operation.destinationSlot)}`
  )).join("");
  return `spostato per ${entry.teamCode} da ${slotLabel(entry.slot)} a ${slotLabel(newSlot)}${contextualDetail}`;
}

function slotLabel(slot: RosterEntry["slot"] | AuctionSlot) {
  if (slot === "two_way") return "Two-way";
  if (slot === "g_league") return "G-League";
  if (slot === "dpe") return "DPE";
  return "Roster";
}

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function currentSeasonDraftAssets(state: EditableLeagueState, seasonName: string) {
  const year = Number(seasonName.slice(0, 4));
  return Number.isInteger(year) ? state.draftAssets.filter((asset) => asset.year === year) : [];
}

function fail(message: string): never {
  redirect(`${auctionPath}?error=${encodeURIComponent(message)}`);
}

function success(message: string, onlyAuctionable = false): never {
  const params = new URLSearchParams({ updated: message });
  if (onlyAuctionable) params.set("onlyAstabili", "1");
  redirect(`${auctionPath}?${params.toString()}`);
}
