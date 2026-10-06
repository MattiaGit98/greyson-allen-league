"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadEditableLeagueState } from "@/lib/league-state";
import { findTeamSlotOverflows, slotOverflowMessage } from "@/lib/roster-slot-limits";
import { legalSlotDestinations, moveRosterEntryToSlot, slotEligibilityErrors, slotMoveTimingErrors, type ManagedRosterSlot } from "@/lib/slot-eligibility";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { leagueMomentFromSeason } from "@/lib/league-moments";

const path = "/admin/slot";

export async function moveRosterSlot(formData: FormData) {
  const teamCode = clean(formData.get("team_code")).toUpperCase();
  const moves = parseMoves(formData.get("moves_json"));
  if (!teamCode || !moves.length) {
    fail("Spostamento non valido.");
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
  const season = seasonResponse.data;

  const state = await loadEditableLeagueState();
  const moment = leagueMomentFromSeason(season);
  const listPlayers = new Map(state.playerList.map((player) => [normalizeName(player.name), player]));
  const requestedNames = new Set<string>();
  const changes = moves.map((move) => {
    const normalizedName = normalizeName(move.playerName);
    if (requestedNames.has(normalizedName)) fail(`Lo spostamento di ${move.playerName} è stato indicato più volte.`);
    requestedNames.add(normalizedName);
    const entryIndex = state.rosterEntries.findIndex((entry) => (
      entry.teamCode === teamCode
      && normalizeName(entry.name) === normalizedName
      && entry.state === "active"
    ));
    const entry = state.rosterEntries[entryIndex];
    if (!entry) fail(`${move.playerName} non appartiene più alla squadra selezionata.`);
    const sourceSlot = entry.slot;
    if (sourceSlot === "dpe") fail(`Per spostare ${entry.name} dalla DPE usa il reintegro.`);
    if (sourceSlot === move.destination) fail(`${entry.name} è già nello slot selezionato.`);
    const listPlayer = listPlayers.get(normalizeName(entry.name));
    const eligibilityEntry = {
      ...entry,
      slot: sourceSlot,
      rookie: listPlayer?.rookie ?? false,
      under23: listPlayer?.under23 ?? false,
    };
    const legalDestinations = legalSlotDestinations(eligibilityEntry, season.name, moment);
    if (!legalDestinations.includes(move.destination)) fail(`${entry.name}: questo spostamento di slot non è consentito.`);
    const timingErrors = slotMoveTimingErrors(eligibilityEntry, move.destination, season.name, moment);
    if (timingErrors.length) fail(`${entry.name}: ${timingErrors.join(" ")}`);
    const eligibilityErrors = slotEligibilityErrors(eligibilityEntry, move.destination, season.name);
    if (eligibilityErrors.length) fail(`${entry.name}: ${eligibilityErrors.join(" ")}`);
    return { entryIndex, playerName: entry.name, sourceSlot, destination: move.destination };
  });
  const changesByIndex = new Map(changes.map((change) => [change.entryIndex, change.destination]));
  const rosterEntries = state.rosterEntries.map((item, index) => {
    const destination = changesByIndex.get(index);
    return destination ? moveRosterEntryToSlot(item, destination) : item;
  });
  const slotErrors = findTeamSlotOverflows(rosterEntries, teamCode).map(slotOverflowMessage);
  if (slotErrors.length) fail(slotErrors.join(" "));

  const nextState = { ...state, rosterEntries };
  const response = await supabase.rpc("apply_slot_movement", {
    expected_before_state: state,
    next_state: nextState,
    requested_season_name: season.name,
    reset_contract_drafts: changes.map((change) => ({
      team_code: teamCode,
      player_name: change.playerName,
    })),
    movement_type: "spostamento_slot",
    movement_summary: changes.map((change) => `${change.playerName} (${teamCode}): ${slotLabel(change.sourceSlot)} → ${slotLabel(change.destination)}`).join("; "),
  });
  if (response.error) fail(response.error.message);
  ["/squadre", "/giocatori", "/movimenti", "/admin", path, "/admin/altre-operazioni", "/admin/contratti"]
    .forEach((route) => revalidatePath(route));
  const updateMessage = changes.length === 1
    ? `${changes[0].playerName}: ${slotLabel(changes[0].sourceSlot)} → ${slotLabel(changes[0].destination)}.`
    : `${changes.length} spostamenti registrati per ${teamCode}.`;
  redirect(`${path}?updated=${encodeURIComponent(updateMessage)}`);
}

function parseMoves(value: FormDataEntryValue | null) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value ?? ""));
  } catch {
    fail("Elenco degli spostamenti non valido.");
  }
  if (!Array.isArray(parsed) || parsed.length > 30) fail("Elenco degli spostamenti non valido.");
  return parsed.map((item) => {
    if (!item || typeof item !== "object") fail("Elenco degli spostamenti non valido.");
    const record = item as Record<string, unknown>;
    const playerName = typeof record.playerName === "string" ? record.playerName.trim() : "";
    const destination = record.destination as ManagedRosterSlot;
    if (!playerName || !["regular", "two_way", "g_league"].includes(destination)) {
      fail("Elenco degli spostamenti non valido.");
    }
    return { playerName, destination };
  });
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("it-IT");
}

function slotLabel(slot: ManagedRosterSlot | "dpe") {
  if (slot === "two_way") return "Two-way";
  if (slot === "g_league") return "G-League";
  if (slot === "dpe") return "DPE";
  return "Roster";
}

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function fail(message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
