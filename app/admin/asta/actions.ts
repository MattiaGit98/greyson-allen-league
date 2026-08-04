"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  acquisitionKindForOutcome,
  auctionContractForSlot,
  auctionDestinationErrors,
  isPostAuctionContractAssignmentCandidate,
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
import { capOverrideRequested, capOverrideSummary, requireCapOverride } from "@/lib/cap-override";
import { slotMoveTimingErrors, type ManagedRosterSlot } from "@/lib/slot-eligibility";
import { applyStandardContractCut } from "@/lib/team-option-contract";

const auctionPath = "/admin/asta";
type AuctionEditKind = "delete" | "cut" | "price" | "slot";

export async function purchaseAuctionPlayer(formData: FormData) {
  const forceCap = capOverrideRequested(formData);
  const playerName = cleanText(formData.get("player_name"));
  const teamCode = cleanText(formData.get("team_code")).toUpperCase();
  const price = Number(formData.get("price"));
  const slot = cleanText(formData.get("slot")) as AuctionSlot;
  const cutPlayerName = cleanText(formData.get("cut_player_name"));
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
  if (!state.teams.some((team) => team.code === teamCode)) fail("Squadra non valida.");
  if (state.rosterEntries.some((entry) => entry.name === playerName && entry.state === "active")) {
    fail("Il giocatore appartiene già a una squadra.");
  }
  if (state.rosterEntries.some((entry) => entry.name === playerName && entry.teamCode === teamCode && entry.state === "cut")) {
    fail("La squadra non può riacquistare un proprio giocatore tagliato finché il contratto pesa sul cap.");
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

  const cutIndex = cutPlayerName ? state.rosterEntries.findIndex((entry) => (
    entry.name === cutPlayerName
    && entry.teamCode === teamCode
    && entry.state === "active"
    && entry.slot === slot
  )) : -1;
  if (cutPlayerName && cutIndex < 0) fail("Il giocatore scelto per il taglio non è più disponibile nello slot di destinazione.");
  if (cutPlayerName === playerName) fail("Il nuovo acquisto non può essere anche il giocatore tagliato.");

  const rosterEntry: RosterEntry = {
    name: player.name,
    role: player.role === "X" ? undefined : player.role,
    cost: price,
    contract: auctionContractForSlot(slot, auctionAcquisition),
    state: "active",
    slot,
    teamCode,
    stretchProvisionApplied: false,
    buyoutApplied: false,
    auctionAcquisition,
    auctionPrice: price,
    contractStartSeason: season.name,
  };
  const rosterEntries = [
    ...state.rosterEntries.map((entry, index) => index === cutIndex ? {
      ...applyStandardContractCut(entry, currentEndYear, "auction_completed"),
    } : entry),
    rosterEntry,
  ];
  const overflow = slotOverflow(rosterEntries, teamCode);
  if (overflow.length) fail(`L'acquisto supera i limiti degli slot: ${overflow.join("; ")}. Seleziona un giocatore da tagliare.`);
  const afterSpace = capSpaces(rosterEntries, teamCode, season.name)[0];
  const capWarnings = afterSpace < 0 && price > 1
    ? [`Oltre quota 1000, in asta si può acquistare soltanto per 1 credito (cap libero ${afterSpace}).`]
    : [];
  requireCapOverride(capWarnings, forceCap, fail);
  const nextState: EditableLeagueState = {
    ...state,
    rosterEntries,
    qualifyingOfferRights: state.qualifyingOfferRights.filter((right) => right.playerName !== playerName),
  };
  await persistAuctionState(
    supabase,
    state,
    nextState,
    "acquisto_asta",
    capOverrideSummary(`${playerName}: acquistato da ${teamCode} per ${price} crediti; slot ${slotLabel(slot)}; contratto ${rosterEntry.contract}; ${acquisitionSummary(qualifyingOutcome)}${cutPlayerName ? `; taglio contestuale di ${cutPlayerName}` : ""}`, capWarnings, forceCap),
  );

  const suffix = cutPlayerName ? ` Taglio contestuale: ${cutPlayerName}.` : "";
  success(`${playerName} assegnato a ${teamCode} per ${price} crediti.${suffix}`);
}

export async function declineQualifyingOffer(formData: FormData) {
  const playerName = cleanText(formData.get("player_name"));
  if (!playerName) fail("Giocatore non valido.");
  const { supabase, season } = await auctionContext();
  const state = await loadEditableLeagueState();
  if (state.playerListStatus !== "published") fail("Il listone ufficiale non è ancora pubblicato.");
  const pendingDraftPicks = currentSeasonDraftAssets(state, season.name);
  if (pendingDraftPicks.length) {
    fail(`Concludi prima il Draft ${season.name.slice(0, 4)}: restano ${pendingDraftPicks.length} scelte da assegnare.`);
  }
  const right = state.qualifyingOfferRights.find((item) => item.playerName === playerName);
  if (!right) fail("La qualifying offer non è più disponibile.");
  if (state.rosterEntries.some((entry) => entry.name === playerName && entry.state === "active")) {
    fail("Il giocatore appartiene già a una squadra.");
  }
  const nextState = {
    ...state,
    qualifyingOfferRights: state.qualifyingOfferRights.filter((item) => item.playerName !== playerName),
  };
  await persistAuctionState(
    supabase,
    state,
    nextState,
    "qualifying_offer_non_estesa",
    `Q.O. non estesa: ${playerName} (${right.teamCode})`,
  );
  success(`Qualifying offer non estesa per ${playerName}. Il giocatore resta disponibile all'asta normale.`);
}

function acquisitionSummary(outcome: QualifyingAuctionOutcome) {
  if (outcome === "qualifying_offer") return "Q.O. accettata";
  if (outcome === "restricted_free_agent") return "restricted free agent";
  if (outcome === "not_extended") return "Q.O. non estesa; asta normale";
  return "asta normale";
}

export async function modifyAuctionPlayer(formData: FormData) {
  const forceCap = capOverrideRequested(formData);
  const playerName = cleanText(formData.get("player_name"));
  const requestedTeamCode = cleanText(formData.get("team_code")).toUpperCase();
  const kind = cleanText(formData.get("edit_kind")) as AuctionEditKind;
  const newPrice = Number(formData.get("new_price"));
  const newSlot = cleanText(formData.get("new_slot")) as AuctionSlot;
  const exchangePlayerName = cleanText(formData.get("exchange_player_name"));
  if (!playerName || !requestedTeamCode || !["delete", "cut", "price", "slot"].includes(kind)) fail("Modifica non valida.");

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
  let exchangeEntry: RosterEntry | undefined;
  if (kind === "delete") {
    rosterEntries = state.rosterEntries.filter((_, index) => index !== entryIndex);
  } else if (kind === "cut") {
    const currentEndYear = seasonEndYear(season.name);
    if (currentEndYear === null) fail("Annata non valida.");
    rosterEntries = state.rosterEntries.map((item, index) => index === entryIndex ? {
      ...applyStandardContractCut(item, currentEndYear, "auction_completed"),
    } : item);
  } else if (kind === "price") {
    if (!Number.isInteger(newPrice) || newPrice < 1) fail("Il nuovo prezzo deve essere un intero di almeno 1 credito.");
    const updateAuctionPrice = isPostAuctionContractAssignmentCandidate(entry, season.name);
    rosterEntries = state.rosterEntries.map((item, index) => index === entryIndex ? {
      ...item,
      cost: newPrice,
      auctionPrice: updateAuctionPrice ? newPrice : item.auctionPrice,
    } : item);
  } else {
    if (!["regular", "two_way", "g_league"].includes(newSlot)) fail("Slot non valido.");
    if (entry.slot === "dpe") fail("Il reintegro dalla DPE va registrato nel blocco Altre operazioni.");
    if (newSlot === entry.slot) fail("Seleziona uno slot diverso da quello attuale.");
    if (entry.auctionAcquisition && newSlot !== "regular") {
      fail("Un giocatore acquistato tramite Q.O. o come RFA deve restare nello slot roster.");
    }
    const timingErrors = slotMoveTimingErrors(
      { ...entry, slot: entry.slot as ManagedRosterSlot },
      newSlot,
      season.name,
      leagueMomentFromSeason(season),
    );
    if (timingErrors.length) fail(timingErrors.join(" "));
    const destinationErrors = auctionDestinationErrors({
      slot: newSlot,
      price: entry.cost,
      rookie: player.rookie,
      under23: player.under23,
    });
    if (destinationErrors.length) fail(destinationErrors.join(" "));

    let exchangeIndex = -1;
    if (exchangePlayerName) {
      exchangeIndex = state.rosterEntries.findIndex((item) => (
        item.name === exchangePlayerName
        && item.teamCode === requestedTeamCode
        && item.state === "active"
      ));
      exchangeEntry = state.rosterEntries[exchangeIndex];
      if (!exchangeEntry || exchangeIndex === entryIndex) fail("Il giocatore scelto per lo scambio di slot non è disponibile.");
      if (exchangeEntry.slot !== newSlot) fail(`Il giocatore scelto non occupa lo slot ${slotLabel(newSlot)}.`);
      if (exchangeEntry.auctionAcquisition && entry.slot !== "regular") {
        fail(`${exchangeEntry.name}: un acquisto tramite Q.O. o come RFA deve restare nello slot roster.`);
      }
      const exchangeTimingErrors = slotMoveTimingErrors(
        { ...exchangeEntry, slot: exchangeEntry.slot as ManagedRosterSlot },
        entry.slot as ManagedRosterSlot,
        season.name,
        leagueMomentFromSeason(season),
      );
      if (exchangeTimingErrors.length) fail(`${exchangeEntry.name}: ${exchangeTimingErrors.join(" ")}`);
      const exchangePlayer = state.playerList.find((item) => item.name === exchangeEntry?.name);
      if (!exchangePlayer) fail("Il giocatore scelto per lo scambio non è presente nel listone.");
      const exchangeErrors = auctionDestinationErrors({
        slot: entry.slot as AuctionSlot,
        price: exchangeEntry.cost,
        rookie: exchangePlayer.rookie,
        under23: exchangePlayer.under23,
      });
      if (exchangeErrors.length) fail(`${exchangeEntry.name}: ${exchangeErrors.join(" ")}`);
    }

    rosterEntries = state.rosterEntries.map((item, index) => {
      if (index === entryIndex) return {
        ...item,
        slot: newSlot,
        contract: newSlot === "regular" ? item.contract : "T.O.",
      };
      if (index === exchangeIndex && entry.slot !== "dpe") return {
        ...item,
        slot: entry.slot,
        contract: entry.slot === "regular" ? item.contract : "T.O.",
      };
      return item;
    });

    const overflow = slotOverflow(rosterEntries, requestedTeamCode);
    if (overflow.length) {
      fail(`Lo spostamento supera i limiti degli slot: ${overflow.join("; ")}. Seleziona un giocatore con cui scambiare lo slot.`);
    }
  }

  const afterSpaces = capSpaces(rosterEntries, requestedTeamCode, season.name);
  const capWarnings: string[] = [];
  if (afterSpaces.slice(1).some((space) => space < 0)) capWarnings.push("La modifica non rispetta il cap delle stagioni future.");
  if (kind === "cut" && entry.slot === "dpe" && afterSpaces[0] < 0) {
    capWarnings.push("Il taglio dalla DPE farebbe superare il salary cap.");
  }
  if (kind === "price" && newPrice > entry.cost && afterSpaces[0] < 0) {
    capWarnings.push("L'aumento del prezzo farebbe superare il salary cap.");
  }
  if (kind === "slot" && entry.slot === "dpe" && afterSpaces[0] < 0) {
    capWarnings.push("Lo spostamento dalla DPE farebbe superare il salary cap.");
  }
  if (kind === "cut" && entry.slot === "dpe" && capWarnings.length) {
    fail(`Il taglio dalla DPE non può violare il salary cap. ${capWarnings.join(" ")}`);
  }
  requireCapOverride(capWarnings, forceCap, fail);

  const detail = modificationDetail(kind, entry, newPrice, newSlot, exchangeEntry);
  await persistAuctionState(
    supabase,
    state,
    { ...state, rosterEntries },
    "modifica_asta",
    capOverrideSummary(`${playerName}: ${detail}`, capWarnings, forceCap),
  );
  const overflow = slotOverflow(rosterEntries, requestedTeamCode);
  success(`${playerName}: ${detail}.${overflow.length ? ` Attenzione: ${overflow.join("; ")}.` : ""}`);
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
    fail("Il pannello è operativo in Offseason — dopo le T.O.");
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
    "/admin/contratti",
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

function modificationDetail(kind: AuctionEditKind, entry: RosterEntry, newPrice: number, newSlot: AuctionSlot, exchangeEntry?: RosterEntry) {
  if (kind === "delete") return `eliminato dal roster ${entry.teamCode}`;
  if (kind === "cut") return `tagliato da ${entry.teamCode}`;
  if (kind === "price") return `prezzo modificato da ${entry.cost} a ${newPrice} per ${entry.teamCode}`;
  const exchangeDetail = exchangeEntry ? `; ${exchangeEntry.name} spostato da ${slotLabel(newSlot)} a ${slotLabel(entry.slot)}` : "";
  return `spostato per ${entry.teamCode} da ${slotLabel(entry.slot)} a ${slotLabel(newSlot)}${exchangeDetail}`;
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

function success(message: string): never {
  redirect(`${auctionPath}?updated=${encodeURIComponent(message)}`);
}
